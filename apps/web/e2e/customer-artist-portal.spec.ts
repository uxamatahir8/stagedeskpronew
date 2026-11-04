import { expect, type APIRequestContext, type Browser, type Page, test } from "@playwright/test";
import { closeBrowserContexts, DEMO_PASSWORD, signIn } from "./helpers";

const MAILPIT = "http://localhost:8025/api/v1";

/**
 * The client's three reports, in the browser: customers can edit their event,
 * customers can request a booking, and artists see what's assigned to them.
 * Test people use the test domains and equipment codes start with E2E-, so
 * `pnpm db:clean-test` removes them.
 */

const run = Date.now().toString(36);
const OWNER = "eigenaar@feestband.local";
const DJ = "dj.sem@feestband.local";
const SPOTIFY = "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M";

/** A date some weeks ahead, different per run so artists are free. */
function futureDate(offsetDays: number) {
  const days = 45 + (Math.floor(Date.now() / 60_000) % 400) + offsetDays;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date(Date.now() + days * 86_400_000));
}

async function newPage(browser: Browser) {
  return (await browser.newContext()).newPage();
}

async function fromMail(request: APIRequestContext, to: string, pattern: RegExp) {
  let found = "";
  await expect(async () => {
    const search = await (await request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:${to}`)}`)).json();
    for (const m of search.messages ?? []) {
      const hit = ((await (await request.get(`${MAILPIT}/message/${m.ID}`)).json()).Text as string).match(pattern);
      if (hit) {
        found = hit[1] ?? hit[0];
        break;
      }
    }
    expect(found).not.toBe("");
  }).toPass({ timeout: 20_000 });
  return found;
}

/** Someone without a password chooses one, through the normal forgotten-password email. */
async function choosePassword(page: Page, request: APIRequestContext, email: string) {
  await page.goto("/nl/forgot-password");
  await page.getByRole("textbox").first().fill(email);
  await page.getByRole("button").filter({ hasText: /link|verstuur|sturen/i }).first().click();
  const link = await fromMail(request, email, /(https?:\/\/\S*reset-password\S+)/);
  await page.goto(link);
  await page.locator("#reset-password").fill(DEMO_PASSWORD);
  await page.locator("#reset-confirm").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Wachtwoord opslaan" }).click();
  await expect(page.getByText(/wachtwoord is/i).first()).toBeVisible();
}

async function newBookingFor(page: Page, name: string, email: string, date: string | null, city = "Utrecht") {
  await page.goto("/nl/app/bookings/new");
  await page.getByRole("tab", { name: "Nieuwe klant" }).click();
  await page.getByLabel("Je naam").fill(name);
  await page.getByLabel("E-mailadres").fill(email);
  if (date) await page.getByLabel("Datum").fill(date);
  await page.getByLabel("Naam locatie").fill("Tivoli");
  await page.getByLabel("Plaats").fill(city);
  await page.getByRole("button", { name: "Boeking aanmaken" }).click();
  await expect(page).toHaveURL(/\/app\/bookings\/[A-Z2-9]{8}$/);
  return page.url().split("/").pop()!;
}

/** Sends a quote and accepts it on the customer's behalf: the booking becomes booked. */
async function acceptForCustomer(page: Page, code: string) {
  await page.goto(`/nl/app/bookings/${code}`);
  await page.getByRole("button", { name: "Offerte maken" }).click();
  await page.getByRole("button", { name: "Toevoegen uit diensten" }).click();
  await page.getByRole("menuitem", { name: /DJ, per uur/ }).click();
  await page.getByRole("button", { name: "Offerte versturen" }).click();
  await expect(page.getByText("Offerte versie 1 verstuurd.")).toBeVisible();
  await page.getByRole("button", { name: "Namens klant accepteren" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Offerte accepteren" }).click();
  await expect(page.getByText("Geboekt", { exact: true }).first()).toBeVisible();
}

async function assign(page: Page, artist: RegExp, name: string) {
  await page.getByRole("combobox", { name: "Kies een artiest" }).click();
  await page.getByRole("option", { name: artist }).click();
  await page.getByRole("button", { name: /Artiest toewijzen|Andere artiest/ }).click();
  await expect(page.getByText(`Verzoek verstuurd naar ${name}.`)).toBeVisible();
}

test.describe.serial("customer portal and artist assignments", () => {
  test.afterEach(async ({ browser }) => {
    await closeBrowserContexts(browser);
  });

  const customerEmail = `portal.${run}@test.local`;
  const customerName = `Portal Klant ${run}`;
  const eventDate = futureDate(0);
  let code = "";

  test("a customer without bookings requests one, and it goes to their agency", async ({ browser, request }) => {
    test.setTimeout(240_000);
    const owner = await newPage(browser);
    const customer = await newPage(browser);
    await signIn(owner, OWNER);

    await test.step("the customer's only booking so far was cancelled, so they have nothing running", async () => {
      const first = await newBookingFor(owner, customerName, customerEmail, futureDate(300));
      await owner.goto(`/nl/app/bookings/${first}`);
      await owner.getByRole("button", { name: "Afwijzen" }).click();
      await owner.getByRole("dialog").getByRole("button", { name: "Afwijzen" }).click();
      await expect(owner.getByText("Afgewezen", { exact: true }).first()).toBeVisible();
      await choosePassword(customer, request, customerEmail);
      await signIn(customer, customerEmail);
    });

    await test.step("the dashboard offers Request a booking", async () => {
      await expect(customer.getByTestId("request-booking")).toBeVisible();
      await expect(customer.getByTestId("request-booking")).toHaveText(/Boeking aanvragen/);
      await customer.getByTestId("request-booking").click();
      await expect(customer).toHaveURL(/\/app\/event\/request$/);
    });

    await test.step("what's known is filled in; a required field and a past date are refused", async () => {
      await expect(customer.locator("#req-name")).toHaveValue(customerName);
      await expect(customer.locator("#req-email")).toHaveValue(customerEmail);
      await expect(customer.getByRole("heading", { name: "Boeking aanvragen" })).toBeVisible();
      await customer.locator("#req-date").fill("2020-01-01");
      await customer.locator("#req-city").fill("Utrecht");
      await customer.getByRole("button", { name: "Aanvraag versturen" }).click();
      await expect(customer.getByTestId("request-sent")).toHaveCount(0);
    });

    await test.step("the request is sent and gets a reference", async () => {
      await customer.goto("/nl/app/event/request");
      await customer.locator("#req-date").fill(eventDate);
      await customer.locator("#req-venue").fill("Tivoli");
      await customer.locator("#req-city").fill("Utrecht");
      await customer.locator("#req-guests").fill("120");
      await customer.locator("#req-genre").fill("Disco");
      await customer.locator("#req-phone").fill("+31 6 11112222");
      await customer.locator("#req-message").fill(`Bruiloft ${run}`);
      await customer.getByRole("button", { name: "Aanvraag versturen" }).click();
      await expect(customer.getByTestId("request-sent")).toBeVisible({ timeout: 30_000 });
      code = (await customer.getByTestId("request-code").textContent())!.trim();
      expect(code).toMatch(/^[A-Z2-9]{8}$/);
    });

    await test.step("the customer sees it right away and can ask for another", async () => {
      await customer.getByRole("link", { name: "Bekijk je boeking" }).click();
      await expect(customer).toHaveURL(new RegExp(`/app/event\\?booking=${code}`));
      await expect(customer.getByText(code).first()).toBeVisible();
      await customer.goto("/nl/app");
      await expect(customer.getByTestId("request-booking")).toHaveText(/Nog een boeking aanvragen/);
    });

    await test.step("the agency is told, and sees where it came from", async () => {
      await owner.goto("/nl/app/notifications");
      await expect(owner.getByText(`Nieuwe aanvraag van ${customerName}`).first()).toBeVisible();
      await owner.goto(`/nl/app/bookings/${code}`);
      await expect(owner.getByText("via klantportaal")).toBeVisible();
      await expect(owner.getByText(`Bruiloft ${run}`)).toBeVisible();
    });

    await test.step("the customer gets a confirmation email", async () => {
      await fromMail(request, customerEmail, new RegExp(`(/app/event\\?booking=${code})`));
    });
  });

  test("the customer edits their wishes; agency and artist see them", async ({ browser }) => {
    test.setTimeout(240_000);
    const owner = await newPage(browser);
    const customer = await newPage(browser);
    const dj = await newPage(browser);
    await signIn(customer, customerEmail);

    await test.step("the event page shows the whole booking", async () => {
      await customer.goto(`/nl/app/event?booking=${code}`);
      await expect(customer.getByText("Boekingsnummer")).toBeVisible();
      await expect(customer.getByText(code).first()).toBeVisible();
      await expect(customer.getByText("Feestband Utrecht").first()).toBeVisible();
      await expect(customer.getByText(/120 gasten/)).toBeVisible();
      await expect(customer.getByRole("button", { name: "Evenementvoorkeuren bewerken" })).toBeVisible();
    });

    await test.step("a link that isn't a music service is refused, keeping what was typed", async () => {
      await customer.getByRole("button", { name: "Evenementvoorkeuren bewerken" }).click();
      const dialog = customer.getByRole("dialog");
      await dialog.locator("#pref-dos").fill(`Openingsdans ${run}\nVeel disco`);
      await dialog.locator("#pref-donts").fill("Geen schlagers");
      await dialog.locator("#pref-playlist").fill("https://evil.example/playlist/1");
      await dialog.getByRole("button", { name: "Opslaan" }).click();
      await expect(dialog.getByText("Gebruik een afspeellijst", { exact: false })).toBeVisible();
      await expect(dialog.locator("#pref-dos")).toHaveValue(`Openingsdans ${run}\nVeel disco`);
    });

    await test.step("a Spotify playlist is saved and survives a reload", async () => {
      const dialog = customer.getByRole("dialog");
      await dialog.locator("#pref-playlist").fill(SPOTIFY);
      await dialog.locator("#pref-music").fill("Graag Earth, Wind & Fire");
      await dialog.locator("#pref-special").fill("Geen muziek tijdens de speeches");
      await dialog.getByRole("button", { name: "Opslaan" }).click();
      await expect(customer.getByText("Je voorkeuren zijn opgeslagen.")).toBeVisible();
      await customer.reload();
      const shown = customer.getByTestId("event-preferences");
      await expect(shown.getByText(`Openingsdans ${run}`)).toBeVisible();
      await expect(shown.getByText("Geen schlagers")).toBeVisible();
      await expect(shown.getByRole("link", { name: "Open de Spotify-afspeellijst" })).toHaveAttribute("href", SPOTIFY);
      await expect(shown.getByText("Graag Earth, Wind & Fire")).toBeVisible();
    });

    await test.step("the agency sees the wishes, and who changed them", async () => {
      await signIn(owner, OWNER);
      await owner.goto(`/nl/app/bookings/${code}`);
      await expect(owner.getByText(`Openingsdans ${run}`)).toBeVisible();
      await expect(owner.getByText("Geen muziek tijdens de speeches")).toBeVisible();
      await expect(owner.getByText("De klant heeft de muziekwensen en instructies bijgewerkt")).toBeVisible();
      await owner.goto("/nl/app/notifications");
      await expect(owner.getByText(new RegExp(`${customerName} heeft de muziekwensen van ${code}`)).first()).toBeVisible();
    });

    await test.step("the agency books it; a profile without a login can't be picked", async () => {
      await acceptForCustomer(owner, code);
      await owner.getByRole("combobox", { name: "Kies een artiest" }).click();
      await expect(owner.getByRole("option", { name: /Lotte Sax/ })).toHaveAttribute("aria-disabled", "true");
      await expect(owner.getByRole("option", { name: /Lotte Sax/ })).toContainText("Nog geen login");
      await owner.keyboard.press("Escape");
    });

    await test.step("assigning DJ Sem reaches DJ Sem: count, dashboard, gigs page", async () => {
      await assign(owner, /^DJ Sem/, "DJ Sem");
      await signIn(dj, DJ);
      await expect(dj.getByTestId("nav-badge-gigs")).toBeVisible();
      const home = dj.getByTestId("gig-requests");
      await expect(home.getByRole("link", { name: /Feestband Utrecht/ }).filter({ hasText: "Feestband Utrecht" }).first()).toBeVisible();
      await dj.goto("/nl/app/notifications");
      await expect(dj.getByText(`Feestband Utrecht vraagt je voor optreden ${code}`).first()).toBeVisible();
      await dj.goto("/nl/app/gigs");
      await expect(dj.getByTestId("gig-requests").locator(`a[href*="/app/gigs/${code}"]`)).toBeVisible();
    });

    await test.step("the email to the artist is on record, and links to the gig", async () => {
      await owner.reload();
      await expect(owner.getByText("E-mails", { exact: false }).first()).toBeVisible();
      await expect(owner.locator("body")).toContainText(DJ);
    });

    await test.step("the brief shows the customer's wishes and the artist accepts", async () => {
      await dj.goto(`/nl/app/gigs/${code}`);
      await expect(dj.getByText(`Openingsdans ${run}`)).toBeVisible();
      await expect(dj.getByText("Geen schlagers")).toBeVisible();
      await expect(dj.getByRole("link", { name: "Open de Spotify-afspeellijst" })).toHaveAttribute("href", SPOTIFY);
      await expect(dj.getByText("Geen muziek tijdens de speeches")).toBeVisible();
      await dj.getByRole("button", { name: "Optreden accepteren" }).click();
      await expect(dj.getByText("Optreden geaccepteerd.")).toBeVisible();
    });

    await test.step("the agency sees the answer: confirmed", async () => {
      await owner.reload();
      await expect(owner.getByText("Bevestigd", { exact: true }).first()).toBeVisible();
      await owner.goto("/nl/app/notifications");
      await expect(owner.getByText(`DJ Sem heeft optreden ${code} geaccepteerd`).first()).toBeVisible();
    });

    await test.step("later wishes reach the assigned artist's brief and notifications", async () => {
      await customer.reload();
      await customer.getByRole("button", { name: "Evenementvoorkeuren bewerken" }).click();
      await customer.getByRole("dialog").locator("#pref-donts").fill(`Geen schlagers\nGeen polonaise ${run}`);
      await customer.getByRole("dialog").getByRole("button", { name: "Opslaan" }).click();
      await expect(customer.getByText("Je voorkeuren zijn opgeslagen.")).toBeVisible();
      await dj.reload();
      await expect(dj.getByText(`Geen polonaise ${run}`)).toBeVisible();
      await dj.goto("/nl/app/notifications");
      await expect(dj.getByText(new RegExp(`${customerName} heeft de muziekwensen van ${code}`)).first()).toBeVisible();
    });
  });

  test("after acceptance a date change waits for the agency, and the artist's equipment stays reachable", async ({ browser }) => {
    test.setTimeout(240_000);
    const owner = await newPage(browser);
    const customer = await newPage(browser);
    const dj = await newPage(browser);
    const moved = futureDate(2);
    await signIn(customer, customerEmail);
    await signIn(owner, OWNER);

    await test.step("the customer asks to move the date; the booking itself doesn't change", async () => {
      await customer.goto(`/nl/app/event?booking=${code}`);
      await customer.getByRole("button", { name: "Wijziging aanvragen" }).click();
      const dialog = customer.getByRole("dialog");
      await dialog.locator("#chg-date").fill(moved);
      await dialog.locator("#chg-note").fill("De locatie is verzet");
      await dialog.getByRole("button", { name: "Verzoek versturen" }).click();
      await expect(customer.getByText("Je verzoek is naar je bureau gestuurd", { exact: false })).toBeVisible();
      await customer.reload();
      await expect(customer.getByTestId("pending-change")).toBeVisible();
      await expect(customer.getByRole("button", { name: "Wijziging aanvragen" })).toHaveCount(0);
    });

    await test.step("the agency approves; the date moves and the artist's brief follows", async () => {
      await owner.goto(`/nl/app/bookings/${code}`);
      const panel = owner.getByTestId("change-request");
      await expect(panel).toBeVisible();
      await expect(panel.getByText("De locatie is verzet")).toBeVisible();
      await panel.getByRole("button", { name: "Goedkeuren en doorvoeren" }).click();
      await expect(owner.getByText("Wijziging goedgekeurd en doorgevoerd", { exact: false })).toBeVisible();
      await expect(owner.getByTestId("change-request")).toHaveCount(0);
      await customer.reload();
      await expect(customer.getByTestId("last-change-decision")).toContainText("goedgekeurd");
      await signIn(dj, DJ);
      await dj.goto("/nl/app/notifications");
      await expect(dj.getByText(new RegExp(`heeft de gegevens van optreden ${code} gewijzigd`)).first()).toBeVisible();
    });

    await test.step("the artist reaches the equipment list from the gig", async () => {
      const item = `E2E-CAP-${run.slice(-6).toUpperCase()}`;
      await owner.goto("/nl/app/inventory");
      await owner.getByRole("button", { name: "Apparatuur toevoegen" }).click();
      const dialog = owner.getByRole("dialog");
      await dialog.getByLabel("Nummer", { exact: true }).fill(item);
      await dialog.getByLabel("Naam", { exact: true }).fill("E2E speaker portal");
      await dialog.getByRole("button", { name: "Opslaan" }).click();
      await expect(owner).toHaveURL(/\/app\/inventory\/[\w-]+$/);
      await owner.goto(`/nl/app/bookings/${code}/equipment`);
      await owner.getByRole("combobox", { name: "Kies apparatuur…" }).click();
      await owner.getByRole("option", { name: new RegExp(item) }).first().click();
      await owner.getByRole("button", { name: "Toevoegen", exact: true }).click();
      await expect(owner.getByText(/toegevoegd/).first()).toBeVisible();
      await dj.goto(`/nl/app/gigs/${code}`);
      await dj.getByRole("link", { name: /Apparatuur/ }).click();
      await expect(dj).toHaveURL(new RegExp(`/app/gigs/${code}/equipment`));
      await expect(dj.getByText(item)).toBeVisible();
    });
  });

  test("nobody sees or edits what isn't theirs", async ({ browser }) => {
    test.setTimeout(180_000);
    const other = await newPage(browser);
    const yara = await newPage(browser);

    await test.step("another customer can't open this booking, not even by its reference", async () => {
      await signIn(other, "sanne@klant.local");
      await other.goto(`/nl/app/event?booking=${code}`);
      await expect(other.locator("body")).not.toContainText(code);
      await expect(other.locator("body")).not.toContainText(`Openingsdans ${run}`);
      await other.goto(`/nl/app/bookings/${code}`);
      await expect(other.locator("body")).not.toContainText(`Openingsdans ${run}`);
      await other.goto(`/nl/app/messages/${code}?channel=customer`);
      await expect(other.locator("body")).not.toContainText(code);
    });

    await test.step("a customer has no way into an artist's page", async () => {
      await other.goto("/nl/app/gigs");
      await expect(other.getByRole("heading", { name: "Mijn optredens" })).toHaveCount(0);
    });

    await test.step("another artist can't open this gig", async () => {
      await signIn(yara, "dj.yara@rotterdamdj.local");
      await yara.goto(`/nl/app/gigs/${code}`);
      await expect(yara.locator("body")).not.toContainText(`Openingsdans ${run}`);
      await yara.goto(`/nl/app/gigs/${code}/equipment`);
      await expect(yara.locator("body")).not.toContainText("E2E speaker portal");
    });
  });

  test("a cancelled booking is read-only for the customer", async ({ browser }) => {
    test.setTimeout(180_000);
    const owner = await newPage(browser);
    const customer = await newPage(browser);
    await signIn(owner, OWNER);
    await signIn(customer, customerEmail);
    await customer.goto("/nl/app/event/request");
    await customer.locator("#req-date").fill(futureDate(5));
    await customer.locator("#req-city").fill(`Zeist ${run}`);
    await customer.getByRole("button", { name: "Aanvraag versturen" }).click();
    await expect(customer.getByTestId("request-sent")).toBeVisible({ timeout: 30_000 });
    const cancelled = (await customer.getByTestId("request-code").textContent())!.trim();

    await owner.goto(`/nl/app/bookings/${cancelled}`);
    await owner.getByRole("button", { name: "Afwijzen" }).click();
    await owner.getByRole("dialog").getByRole("button", { name: "Afwijzen" }).click();
    await expect(owner.getByText("Afgewezen", { exact: true }).first()).toBeVisible();

    await customer.goto(`/nl/app/event?booking=${cancelled}`);
    await expect(customer.getByText("Deze boeking kan niet meer worden gewijzigd", { exact: false })).toBeVisible();
    await expect(customer.getByRole("button", { name: "Evenementvoorkeuren bewerken" })).toHaveCount(0);
    await expect(customer.getByRole("button", { name: /Wijziging aanvragen|Gegevens wijzigen/ })).toHaveCount(0);
  });

  test("an undated request stays visible, and an accepted undated gig isn't filed as past", async ({ browser }) => {
    test.setTimeout(240_000);
    const owner = await newPage(browser);
    const dj = await newPage(browser);
    await signIn(owner, OWNER);
    const undated = await newBookingFor(owner, `Zonder Datum ${run}`, `undated.${run}@test.local`, null, `Datumloos ${run}`);
    await acceptForCustomer(owner, undated);
    await assign(owner, /^DJ Sem/, "DJ Sem");

    await signIn(dj, DJ);
    await expect(dj.getByTestId("gig-requests").locator(`a[href*="/app/gigs/${undated}"]`)).toContainText("Datum nog niet bekend");
    await dj.goto("/nl/app/gigs");
    const requests = dj.getByTestId("gig-requests").locator(`a[href*="/app/gigs/${undated}"]`);
    await expect(requests).toContainText("Datum nog niet bekend");
    await expect(requests).toContainText(/Nieuwe aanvraag/);

    await requests.click();
    await dj.getByRole("button", { name: "Optreden accepteren" }).click();
    await expect(dj.getByText("Optreden geaccepteerd.")).toBeVisible();
    await dj.goto("/nl/app/gigs");
    await expect(dj.getByTestId("gig-requests").locator(`a[href*="/app/gigs/${undated}"]`)).toHaveCount(0);
    await expect(dj.locator(`a[href*="/app/gigs/${undated}"]`)).toContainText("Geaccepteerd, datum volgt");
  });

  test("a shared artist's gig works across agencies, also from another active agency", async ({ browser, request }) => {
    test.setTimeout(300_000);
    const rotterdam = await newPage(browser);
    const owner = await newPage(browser);
    const person = await newPage(browser);
    const email = `dj.both.${run}@test.local`;
    const stage = `E2E Both ${run}`;
    await signIn(rotterdam, "eigenaar@rotterdamdj.local");
    await signIn(owner, OWNER);

    await test.step("Rotterdam adds an artist, who is also a customer of Feestband", async () => {
      await rotterdam.goto("/nl/app/artists");
      await rotterdam.getByRole("button", { name: "Artiest toevoegen" }).click();
      const dialog = rotterdam.getByRole("dialog");
      await dialog.locator('input[name="stageName"]').fill(stage);
      await dialog.locator('input[name="email"]').fill(email);
      await dialog.getByRole("button", { name: "Opslaan" }).click();
      await expect(rotterdam).toHaveURL(/\/app\/artists\/[\w-]+$/);
      await expect(rotterdam.getByTestId("artist-account-panel")).toContainText("Nog geen wachtwoord");
      await rotterdam.getByRole("button", { name: "Nieuwe wachtwoordlink sturen" }).click();
      await expect(rotterdam.getByText(`nieuwe wachtwoordlink onderweg naar ${email}`, { exact: false })).toBeVisible();

      await newBookingFor(owner, stage, email, futureDate(9));
      await choosePassword(person, request, email);
    });

    const gig = await test.step("Rotterdam assigns them while they haven't signed in yet", async () => {
      const code = await newBookingFor(rotterdam, `Klant Rotterdam ${run}`, `rot.${run}@test.local`, futureDate(11), "Rotterdam");
      await acceptForCustomer(rotterdam, code);
      await assign(rotterdam, new RegExp(`^${stage}`), stage);
      return code;
    });

    await test.step("from Feestband, where they're a customer, the request still shows and opens", async () => {
      await person.goto("/nl/sign-in");
      await person.locator("#signin-email").fill(email);
      await person.locator("#signin-password").fill(DEMO_PASSWORD);
      await person.getByRole("button", { name: "Inloggen", exact: true }).click();
      await expect(person.getByLabel(/Ik ga akkoord/).or(person.locator('[data-slot="sidebar"]').first())).toBeVisible({ timeout: 30_000 });
      if (await person.getByLabel(/Ik ga akkoord/).isVisible()) {
        await person.getByLabel(/Ik ga akkoord/).check();
        await person.getByRole("button", { name: "Doorgaan" }).click();
      }
      await expect(person.locator('[data-slot="sidebar"]').first()).toBeVisible({ timeout: 60_000 });
      await person.locator('[data-slot="sidebar"]').first().getByRole("button", { name: /Rotterdam DJ Collectief/ }).click();
      await person.getByRole("menuitem", { name: /Feestband Utrecht/ }).click();
      await expect(person.locator('[data-slot="sidebar"]').first().getByText("Feestband Utrecht").first()).toBeVisible({ timeout: 30_000 });
      await person.waitForTimeout(500);
      await person.goto("/nl/app");
      await expect(person.getByTestId("gig-requests").locator(`a[href*="/app/gigs/${gig}"]`)).toBeVisible();
      await expect(person.getByTestId("nav-badge-gigs")).toHaveText("1");
      await person.goto(`/nl/app/gigs/${gig}`);
      await expect(person.getByRole("button", { name: "Optreden accepteren" })).toBeVisible();
      await person.getByRole("button", { name: "Optreden accepteren" }).click();
      await expect(person.getByText("Optreden geaccepteerd.")).toBeVisible();
    });

    await test.step("Rotterdam sees the booking confirmed", async () => {
      await rotterdam.goto(`/nl/app/bookings/${gig}`);
      await expect(rotterdam.getByText("Bevestigd", { exact: true }).first()).toBeVisible();
    });

    await test.step("DJ Yara, shared with Feestband, sees and answers Feestband's request", async () => {
      const shared = await newBookingFor(owner, `Klant Gedeeld ${run}`, `gedeeld.${run}@test.local`, futureDate(13));
      await acceptForCustomer(owner, shared);
      await assign(owner, /^DJ Yara/, "DJ Yara");
      const yara = await newPage(browser);
      await signIn(yara, "dj.yara@rotterdamdj.local");
      await yara.goto("/nl/app/gigs");
      await expect(yara.getByTestId("gig-requests").locator(`a[href*="/app/gigs/${shared}"]`)).toContainText("Feestband Utrecht");
      await yara.goto(`/nl/app/gigs/${shared}`);
      await yara.getByRole("button", { name: "Afwijzen" }).click();
      await yara.getByRole("dialog").getByRole("textbox").fill("Andere afspraak");
      await yara.getByRole("dialog").getByRole("button", { name: "Afwijzen" }).click();
      await expect(yara.getByText("Verzoek afgewezen.")).toBeVisible();
      await owner.goto(`/nl/app/bookings/${shared}`);
      await expect(owner.getByText("Andere afspraak", { exact: false }).first()).toBeVisible();
      // Their old link says what happened instead of a dead end.
      await yara.goto(`/nl/app/gigs/${shared}`);
      await expect(yara.getByText("Deze aanvraag van Feestband Utrecht staat niet meer open")).toBeVisible();
    });
  });

  test("a profile without a login is explained, and can be invited", async ({ browser, request }) => {
    test.setTimeout(180_000);
    const owner = await newPage(browser);
    await signIn(owner, OWNER);
    await owner.goto("/nl/app/artists");
    // The demo agency has more artists than fit on a page.
    await owner.getByPlaceholder("Zoek op naam of genre").fill("Lotte Sax");
    await expect(owner.getByRole("link", { name: /Lotte Sax/ })).toContainText("Nog geen login");
    await owner.getByPlaceholder("Zoek op naam of genre").fill("DJ Ruben");
    // The demo has more than one "DJ Ruben": take one without a working login. Earlier runs may have
    // invited it already, until `pnpm db:clean-test` unlinks that test account.
    await owner.getByRole("link", { name: /DJ Ruben/ }).filter({ hasText: /Nog geen login|Nog geen wachtwoord/ }).first().click();
    const panel = owner.getByTestId("artist-account-panel");
    await expect(panel).toBeVisible();
    if (await panel.getByRole("button", { name: "Uitnodiging versturen" }).isVisible()) {
      const email = `ruben.${run}@test.local`;
      await panel.locator("#artist-invite-email").fill(email);
      await panel.getByRole("button", { name: "Uitnodiging versturen" }).click();
      await expect(owner.getByText(`Uitnodiging verstuurd naar ${email}`, { exact: false })).toBeVisible();
      await expect(owner.getByTestId("artist-account-panel")).toContainText("Nog geen wachtwoord");
      await fromMail(request, email, /(https?:\/\/\S+\/reset-password\?token=\w+&setup=1)/);
    } else {
      await expect(panel).toContainText("Nog geen wachtwoord");
    }
  });
});
