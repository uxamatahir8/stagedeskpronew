import { expect, type APIRequestContext, type Browser, type Page, test } from "@playwright/test";
import { closeBrowserContexts, DEMO_PASSWORD, signIn } from "./helpers";

const MAILPIT = "http://localhost:8025/api/v1";

/**
 * The review's findings in the browser: separate requests stay separate, a change
 * decision reaches the customer, a stale change can't overwrite newer values, an
 * artist's access follows their membership, and booking requests follow the
 * booking page setting. Test people use the test domains, so `pnpm db:clean-test` removes them.
 */

const run = Date.now().toString(36);
const OWNER = "eigenaar@feestband.local";
const ROTTERDAM = "eigenaar@rotterdamdj.local";
// Further ahead than the portal spec's dates, so demo artists are free.
const firstDay = 3_100 + (Math.floor(Date.now() / 60_000) % 2_000);
const futureDate = (offset: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date(Date.now() + (firstDay + offset) * 86_400_000));

const newPage = async (browser: Browser) => (await browser.newContext()).newPage();

async function mails(request: APIRequestContext, to: string) {
  const search = await (await request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:${to}`)}`)).json();
  return (search.messages ?? []) as { ID: string; Subject: string }[];
}

async function mailMatching(request: APIRequestContext, to: string, subject: RegExp) {
  await expect(async () => expect((await mails(request, to)).filter((m) => subject.test(m.Subject))).not.toHaveLength(0)).toPass({ timeout: 30_000 });
  const found = (await mails(request, to)).filter((m) => subject.test(m.Subject));
  return { count: found.length, text: (await (await request.get(`${MAILPIT}/message/${found[0]!.ID}`)).json()).Text as string };
}

async function linkFromMail(request: APIRequestContext, to: string, pattern: RegExp) {
  let found = "";
  await expect(async () => {
    for (const m of await mails(request, to)) {
      const hit = ((await (await request.get(`${MAILPIT}/message/${m.ID}`)).json()).Text as string).match(pattern);
      if (hit) found = hit[1] ?? hit[0];
    }
    expect(found).not.toBe("");
  }).toPass({ timeout: 30_000 });
  return found;
}

async function setPassword(page: Page, link: string) {
  await page.goto(link);
  await page.locator("#reset-password").fill(DEMO_PASSWORD);
  await page.locator("#reset-confirm").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Wachtwoord opslaan" }).click();
  await expect(page.getByText(/wachtwoord is/i).first()).toBeVisible();
}

async function newBookingFor(page: Page, name: string, email: string, date: string) {
  await page.goto("/nl/app/bookings/new");
  await page.getByRole("tab", { name: "Nieuwe klant" }).click();
  await page.getByLabel("Naam van de klant").fill(name);
  await page.getByLabel("E-mailadres").fill(email);
  await page.getByLabel("Datum").fill(date);
  await page.getByLabel("Naam locatie").fill("Tivoli");
  await page.getByLabel("Plaats").fill("Utrecht");
  await page.getByRole("button", { name: "Boeking aanmaken" }).click();
  await expect(page).toHaveURL(/\/app\/bookings\/[A-Z2-9]{8}$/);
  return page.url().split("/").pop()!;
}

async function acceptForCustomer(page: Page, code: string) {
  await page.goto(`/nl/app/bookings/${code}`);
  await page.getByRole("button", { name: "Offerte maken" }).click();
  await page.getByRole("button", { name: "Toevoegen uit diensten" }).click();
  await page.getByRole("menuitem").first().click();
  await page.getByRole("button", { name: "Offerte versturen" }).click();
  await expect(page.getByText("Offerte versie 1 verstuurd.")).toBeVisible();
  await page.getByRole("button", { name: "Namens klant accepteren" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Offerte accepteren" }).click();
  await expect(page.getByText("Geboekt", { exact: true }).first()).toBeVisible();
}

async function askForDate(customer: Page, code: string, date: string) {
  await customer.goto(`/nl/app/event?booking=${code}`);
  await customer.getByRole("button", { name: "Wijziging aanvragen" }).click();
  const dialog = customer.getByRole("dialog");
  await dialog.locator("#chg-date").fill(date);
  await dialog.getByRole("button", { name: "Verzoek versturen" }).click();
  await expect(customer.getByText("Je verzoek is naar je bureau gestuurd", { exact: false })).toBeVisible();
}

async function agencyMovesDate(page: Page, code: string, date: string) {
  await page.goto(`/nl/app/bookings/${code}`);
  await page.getByRole("button", { name: "Bewerken", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#ed-eventDate").fill(date);
  await dialog.getByRole("button", { name: "Opslaan" }).click();
  await expect(dialog).toHaveCount(0);
}

/**
 * Refused or not found, by what Next.js sends when forbidden() or notFound() was really
 * thrown. Refusals render inside the stream with status 200, so the status says nothing.
 */
async function expectNoAccess(page: Page, path: string, secret: string) {
  const body = await (await page.request.get(path)).text();
  expect(body, path).toMatch(/NEXT_HTTP_ERROR_FALLBACK;40[34]/);
  expect(body, path).not.toContain(secret);
}

test.describe.serial("portal hardening", () => {
  test.afterEach(async ({ browser }) => {
    await closeBrowserContexts(browser);
  });

  const customerEmail = `hard.${run}@test.local`;
  const customerName = `Hard Klant ${run}`;
  let first = "";

  test("two separate requests on one day stay two bookings", async ({ browser, request }) => {
    test.setTimeout(240_000);
    const owner = await newPage(browser);
    const customer = await newPage(browser);
    await signIn(owner, OWNER);
    first = await newBookingFor(owner, customerName, customerEmail, futureDate(0));
    await customer.goto("/nl/forgot-password");
    await customer.getByRole("textbox").first().fill(customerEmail);
    await customer.getByRole("button").filter({ hasText: /link|verstuur|sturen/i }).first().click();
    await setPassword(customer, await linkFromMail(request, customerEmail, /(https?:\/\/\S*reset-password\S+)/));
    await signIn(customer, customerEmail);

    const send = async () => {
      await customer.goto("/nl/app/event/request");
      await customer.locator("#req-date").fill(futureDate(30));
      await customer.locator("#req-venue").fill("Tivoli");
      await customer.locator("#req-city").fill("Utrecht");
      await customer.getByRole("button", { name: "Aanvraag versturen" }).click();
      await expect(customer.getByTestId("request-sent")).toBeVisible({ timeout: 30_000 });
      return (await customer.getByTestId("request-code").textContent())!.trim();
    };
    const one = await send();
    const two = await send();
    expect(two).not.toBe(one);
    await owner.goto(`/nl/app/bookings/${one}`);
    await expect(owner.getByText("via klantportaal")).toBeVisible();
    await owner.goto(`/nl/app/bookings/${two}`);
    await expect(owner.getByText("via klantportaal")).toBeVisible();
  });

  test("an approval and a refusal each reach the customer: notification and one email", async ({ browser, request }) => {
    test.setTimeout(300_000);
    const owner = await newPage(browser);
    const customer = await newPage(browser);
    await signIn(owner, OWNER);
    await signIn(customer, customerEmail);
    await acceptForCustomer(owner, first);

    await test.step("approved", async () => {
      await askForDate(customer, first, futureDate(2));
      await owner.goto(`/nl/app/bookings/${first}`);
      await owner.getByTestId("change-request").getByRole("button", { name: "Goedkeuren en doorvoeren" }).click();
      await expect(owner.getByText("Wijziging goedgekeurd en doorgevoerd", { exact: false })).toBeVisible();
      const mail = await mailMatching(request, customerEmail, /heeft je wijziging doorgevoerd/);
      expect(mail.count).toBe(1);
      expect(mail.text).toContain(first);
      expect(mail.text).toContain("Feestband Utrecht");
      expect(mail.text).toContain(`/app/event?booking=${first}`);
      await customer.goto("/nl/app/notifications");
      await expect(customer.getByText(`Feestband Utrecht heeft je gevraagde wijziging van ${first} goedgekeurd`).first()).toBeVisible();
    });

    await test.step("refused, with the reason", async () => {
      await askForDate(customer, first, futureDate(3));
      await owner.goto(`/nl/app/bookings/${first}`);
      const panel = owner.getByTestId("change-request");
      await panel.locator("#change-reason").fill(`Zaal vol ${run}`);
      await panel.getByRole("button", { name: "Weigeren" }).click();
      await expect(owner.getByText("Wijziging geweigerd.", { exact: false })).toBeVisible();
      const mail = await mailMatching(request, customerEmail, /kon je wijziging niet doorvoeren/);
      expect(mail.count).toBe(1);
      expect(mail.text).toContain(`Zaal vol ${run}`);
      await customer.goto("/nl/app/notifications");
      await expect(customer.getByText(`Feestband Utrecht kon je gevraagde wijziging van ${first} niet doorvoeren`).first()).toBeVisible();
    });
  });

  test("a change request can't overwrite what changed after it was made", async ({ browser, request }) => {
    test.setTimeout(300_000);
    const owner = await newPage(browser);
    const second = await newPage(browser);
    const customer = await newPage(browser);
    await signIn(owner, OWNER);
    await signIn(customer, customerEmail);
    await askForDate(customer, first, futureDate(4));
    const before = (await mails(request, customerEmail)).length;

    await test.step("a reviewer with the old page open is refused and shown the current values", async () => {
      await owner.goto(`/nl/app/bookings/${first}`);
      await expect(owner.getByTestId("change-stale")).toHaveCount(0);
      await signIn(second, "beheer@feestband.local");
      await agencyMovesDate(second, first, futureDate(5));

      await owner.getByTestId("change-request").getByRole("button", { name: "Goedkeuren en doorvoeren" }).click();
      await expect(owner.getByText("De gegevens van de boeking zijn gewijzigd", { exact: false })).toBeVisible();
      await expect(owner.getByTestId("change-stale")).toBeVisible();
      await expect(owner.getByTestId("change-conflict")).toHaveCount(1);
      // Not reported as approved: the request is still open and nobody was told otherwise.
      await expect(owner.getByRole("button", { name: "Goedkeuren en doorvoeren" })).toHaveCount(0);
      expect((await mails(request, customerEmail)).length).toBe(before);
      await customer.reload();
      await expect(customer.getByTestId("pending-change")).toBeVisible();
    });

    await test.step("the conflict is readable on a phone", async () => {
      await owner.setViewportSize({ width: 390, height: 844 });
      await owner.reload();
      await expect(owner.getByTestId("change-conflict")).toBeVisible();
      const overflow = await owner.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
      await owner.setViewportSize({ width: 1280, height: 800 });
    });

    await test.step("applying it needs an explicit choice", async () => {
      owner.once("dialog", (d) => d.dismiss());
      await owner.getByRole("button", { name: "Verzoek toch doorvoeren" }).click();
      await expect(owner.getByTestId("change-request")).toBeVisible();

      await owner.reload();
      owner.once("dialog", (d) => d.accept());
      await owner.getByRole("button", { name: "Verzoek toch doorvoeren" }).click();
      await expect(owner.getByText("Wijziging goedgekeurd en doorgevoerd", { exact: false })).toBeVisible();
      await expect(owner.getByTestId("change-request")).toHaveCount(0);
    });
  });

  test("an artist is invited, sets a password, gets a gig, and loses it with their membership", async ({ browser, request }) => {
    test.setTimeout(360_000);
    const owner = await newPage(browser);
    const artist = await newPage(browser);
    const stale = await newPage(browser);
    const email = `hard.artist.${run}@test.local`;
    const stage = `E2E Hard ${run}`;
    await signIn(owner, OWNER);

    await test.step("adding them reports the setup email and shows it needs setup", async () => {
      await owner.goto("/nl/app/artists");
      await owner.getByRole("button", { name: "Artiest toevoegen" }).click();
      const dialog = owner.getByRole("dialog");
      await dialog.locator('input[name="stageName"]').fill(stage);
      await dialog.locator('input[name="email"]').fill(email);
      await dialog.getByRole("button", { name: "Opslaan" }).click();
      await expect(owner).toHaveURL(/\/app\/artists\/[\w-]+$/);
      await expect(owner.getByTestId("artist-account-panel")).toContainText("Nog geen wachtwoord");
    });

    const setup = await test.step("the setup link works once", async () => {
      const link = await linkFromMail(request, email, /(https?:\/\/\S+\/reset-password\?token=\w+&setup=1)/);
      await setPassword(artist, link);
      await owner.reload();
      await expect(owner.getByTestId("artist-account-state")).toContainText("Klaar voor aanvragen");
      await expect(owner.getByTestId("artist-account-panel")).toHaveCount(0);
      await signIn(artist, email);
      return link;
    });

    await test.step("a used link doesn't work again", async () => {
      await stale.goto(setup);
      const field = stale.locator("#reset-password");
      if (await field.isVisible()) {
        await field.fill(`${DEMO_PASSWORD}-x`);
        await stale.locator("#reset-confirm").fill(`${DEMO_PASSWORD}-x`);
        await stale.getByRole("button", { name: "Wachtwoord opslaan" }).click();
        await expect(stale.getByText(/wachtwoord is (opgeslagen|gewijzigd)/i)).toHaveCount(0);
      }
    });

    const gig = await test.step("the artist receives the assignment", async () => {
      const code = await newBookingFor(owner, `Klant Hard ${run}`, `hard.k.${run}@test.local`, futureDate(40));
      await acceptForCustomer(owner, code);
      await owner.getByRole("combobox", { name: "Kies een artiest" }).click();
      await owner.getByRole("option", { name: new RegExp(`^${stage}`) }).click();
      await owner.getByRole("button", { name: /Artiest toewijzen|Andere artiest/ }).click();
      await expect(owner.getByText(`Verzoek verstuurd naar ${stage}.`)).toBeVisible();
      await artist.goto("/nl/app/gigs");
      await expect(artist.getByTestId("gig-requests").locator(`a[href*="/app/gigs/${code}"]`)).toBeVisible();
      await artist.goto(`/nl/app/gigs/${code}`);
      await expect(artist.getByRole("button", { name: "Optreden accepteren" })).toBeVisible();
      return code;
    });

    await test.step("no longer an artist: the open page's answer is refused, and everything is gone", async () => {
      await owner.goto("/nl/app/team");
      // The demo agency has more members than fit on a page.
      await owner.getByPlaceholder("Zoek op naam of e-mail").fill(email);
      const row = owner.getByRole("row").filter({ hasText: email });
      await row.getByRole("combobox", { name: "Rol" }).click();
      await owner.getByRole("option", { name: "Medewerker bureau" }).click();
      await expect(owner.getByText("Rol bijgewerkt.")).toBeVisible();

      // Their tab was still open, with the button on it: the server refuses it.
      await artist.getByRole("button", { name: "Optreden accepteren" }).click();
      // They hold no artist role anywhere now, so the permission refuses them before the assignment is looked at.
      await expect(artist.getByText("Je hebt geen toegang tot deze pagina")).toBeVisible();
      await owner.goto(`/nl/app/bookings/${gig}`);
      await expect(owner.getByText("Geboekt", { exact: true }).first()).toBeVisible();

      // Every door by direct address: really refused, not just still loading, and nothing of the booking sent.
      // (Messages aren't in this list: they're staff here now, and staff read their agency's conversations.)
      for (const path of [`/nl/app/gigs/${gig}`, `/nl/app/gigs/${gig}/equipment`, "/nl/app/gigs"]) await expectNoAccess(artist, path, `Klant Hard ${run}`);
    });

    await test.step("the agency sees why", async () => {
      await owner.goto("/nl/app/artists");
      await owner.getByPlaceholder("Zoek op naam of genre").fill(stage);
      await expect(owner.getByRole("link", { name: new RegExp(stage) })).toContainText("Niet meer in het team");
      await owner.goto(`/nl/app/bookings/${gig}`);
      await expect(owner.locator("body")).toContainText(stage);
    });

    await test.step("removed from the team: the profile is unlinked and the conversation closed too", async () => {
      await owner.goto("/nl/app/team");
      await owner.getByPlaceholder("Zoek op naam of e-mail").fill(email);
      await owner.getByRole("row").filter({ hasText: email }).getByRole("button", { name: "Verwijderen" }).click();
      await owner.getByRole("dialog").getByRole("button", { name: "Verwijderen" }).click();
      await expect(owner.getByText("is verwijderd.", { exact: false })).toBeVisible();
      await owner.goto("/nl/app/artists");
      await owner.getByPlaceholder("Zoek op naam of genre").fill(stage);
      await expect(owner.getByRole("link", { name: new RegExp(stage) })).toContainText("Nog geen login");
      // Without a team they land elsewhere; what matters is that nothing of the booking comes back.
      const thread = await (await artist.request.get(`/nl/app/messages/${gig}?channel=artist`)).text();
      expect(thread).not.toContain(`Klant Hard ${run}`);
    });
  });

  test("booking requests follow the booking page setting", async ({ browser, request }) => {
    test.setTimeout(300_000);
    const owner = await newPage(browser);
    const customer = await newPage(browser);
    const email = `hard.rot.${run}@test.local`;
    await signIn(owner, ROTTERDAM);
    await newBookingFor(owner, `Klant Rot ${run}`, email, futureDate(50));
    await customer.goto("/nl/forgot-password");
    await customer.getByRole("textbox").first().fill(email);
    await customer.getByRole("button").filter({ hasText: /link|verstuur|sturen/i }).first().click();
    await setPassword(customer, await linkFromMail(request, email, /(https?:\/\/\S*reset-password\S+)/));
    await signIn(customer, email);

    const setOnline = async (online: boolean) => {
      await owner.goto("/nl/app/booking-page");
      await owner.getByRole("tab", { name: "Delen", exact: true }).click();
      const toggle = owner.locator("#bp-enabled");
      await expect(toggle).toBeVisible();
      if ((await toggle.getAttribute("aria-checked")) !== String(online)) await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", String(online));
      await owner.getByRole("button", { name: "Wijzigingen opslaan" }).click();
      await expect(owner.getByText("Boekingspagina opgeslagen.").first()).toBeVisible();
    };

    try {
      await setOnline(false);
      await customer.goto("/nl/app/event/request");
      await expect(customer.getByText("neemt hier op dit moment geen aanvragen aan", { exact: false })).toBeVisible();
      await expect(customer.getByRole("button", { name: "Aanvraag versturen" })).toHaveCount(0);
      // The public page closes with it.
      const open = await request.get("/nl/b/rotterdam-dj-collectief");
      expect(await open.text()).toMatch(/NEXT_HTTP_ERROR_FALLBACK;404/);
    } finally {
      await setOnline(true);
    }
    await customer.goto("/nl/app/event/request");
    await customer.locator("#req-date").fill(futureDate(51));
    await customer.locator("#req-city").fill("Rotterdam");
    await customer.getByRole("button", { name: "Aanvraag versturen" }).click();
    await expect(customer.getByTestId("request-sent")).toBeVisible({ timeout: 30_000 });
  });
});
