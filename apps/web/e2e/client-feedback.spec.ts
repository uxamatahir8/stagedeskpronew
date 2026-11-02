import { expect, type Page, type APIRequestContext, test } from "@playwright/test";
import { ADMIN_EMAIL, signIn } from "./helpers";

const MAILPIT = "http://localhost:8025/api/v1";

/**
 * Client feedback (CF-01 … CF-17) in the browser, as the demo agency
 * Feestband Utrecht, DJ Sem and the platform admin. Test data uses the test
 * domains and E2E- equipment codes, so `pnpm db:clean-test` removes it.
 */

type MailSummary = { ID: string; Subject: string; From: { Name: string; Address: string } };

/** The newest message to `to` whose subject matches, with its text and headers. */
async function mailTo(request: APIRequestContext, to: string, subject: RegExp) {
  let found: { text: string; from: string; replyTo: string; subject: string } | null = null;
  await expect(async () => {
    const search = await (await request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:${to}`)}`)).json();
    const hit = ((search.messages ?? []) as MailSummary[]).find((m) => subject.test(m.Subject));
    expect(hit).toBeTruthy();
    const message = await (await request.get(`${MAILPIT}/message/${hit!.ID}`)).json();
    found = {
      // Intl puts a no-break space between € and the amount.
      text: (message.Text as string).replace(/[  ]/g, " "),
      subject: message.Subject as string,
      from: `${message.From?.Name ?? ""} <${message.From?.Address ?? ""}>`,
      replyTo: ((message.ReplyTo ?? []) as { Address: string }[]).map((r) => r.Address).join(","),
    };
  }).toPass({ timeout: 20_000 });
  return found!;
}

/** Picks an option in the app's select (a Radix listbox, not a native <select>). */
async function pick(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function newPhoneBooking(page: Page, name: string, email: string, date: string) {
  await page.goto(`/nl/app/bookings/new?date=${date}`);
  // The date from the calendar link is filled in (and can still be changed).
  await expect(page.getByLabel("Datum")).not.toHaveValue("");
  await page.getByRole("tab", { name: "Nieuwe klant" }).click();
  await page.getByLabel("Je naam").fill(name);
  await page.getByLabel("E-mailadres").fill(email);
  await page.getByLabel("Naam locatie").fill("Tivoli");
  await page.getByLabel("Plaats").fill("Utrecht");
  await page.getByRole("button", { name: "Boeking aanmaken" }).click();
  await expect(page).toHaveURL(/\/app\/bookings\/[A-Z2-9]{8}$/);
  return page.url().split("/").pop()!;
}

/** A date some weeks ahead, different per run so artists are free. */
function futureDate(run: string, offsetDays: number) {
  const d = new Date(Date.now() + (40 + (parseInt(run.slice(-3), 36) % 200) + offsetDays) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

test("client feedback: equipment, calendar, quotes, artists, details link, invoices and support", async ({ browser, request }) => {
  // One long walkthrough of seventeen items (three people, many pages).
  test.setTimeout(300_000);
  const run = Date.now().toString(36);
  const owner = await (await browser.newContext()).newPage();
  const customerPage = await (await browser.newContext()).newPage();
  await signIn(owner, "eigenaar@feestband.local");
  const prefix = `E2E${run.slice(-5).toUpperCase()}`;

  await test.step("CF-02: four identical lights get four numbers and serials", async () => {
    await owner.goto("/nl/app/inventory");
    await owner.getByRole("button", { name: "Apparatuur toevoegen" }).click();
    const dialog = owner.getByRole("dialog");
    await dialog.getByLabel("Nummer", { exact: true }).fill(`${prefix}-1`);
    await dialog.getByLabel("Aantal", { exact: true }).fill("4");
    await expect(dialog.getByLabel("Nummer van apparaat 4", { exact: true })).toBeVisible();
    await dialog.getByLabel("Naam", { exact: true }).fill(`E2E Moving head ${run}`);
    for (let i = 1; i <= 4; i++) await dialog.getByLabel(`Serienummer van apparaat ${i}`, { exact: true }).fill(`SN-${run}-${i}`);
    // A repeated serial is refused and nothing is created.
    await dialog.getByLabel("Serienummer van apparaat 4", { exact: true }).fill(`SN-${run}-1`);
    await dialog.getByRole("button", { name: "4 apparaten toevoegen" }).click();
    await expect(owner.getByText("Dat serienummer is al gebruikt", { exact: false })).toBeVisible();
    await dialog.getByLabel("Serienummer van apparaat 4", { exact: true }).fill(`SN-${run}-4`);
    await dialog.getByRole("button", { name: "4 apparaten toevoegen" }).click();
    await expect(owner.getByText("4 apparaten toegevoegd")).toBeVisible();
    await owner.goto(`/nl/app/inventory?q=${encodeURIComponent(`E2E Moving head ${run}`)}`);
    await expect(owner.getByRole("link", { name: new RegExp(`^${prefix}-\\d+$`) })).toHaveCount(4);
  });

  await test.step("CF-01: report one light defective from the list, then repair it", async () => {
    const row = owner.getByRole("row").filter({ hasText: `E2E Moving head ${run}` }).first();
    await row.getByRole("button", { name: "Defect melden" }).click();
    await owner.getByRole("dialog").getByLabel("Notitie").fill("Lamp brandt niet");
    await owner.getByRole("dialog").getByRole("button", { name: "Defect melden" }).click();
    await expect(row.getByText("Defect", { exact: true })).toBeVisible();
    await row.getByRole("button", { name: "Gerepareerd" }).click();
    await owner.getByRole("dialog").getByRole("button", { name: "Gerepareerd" }).click();
    await expect(row.getByText("Beschikbaar", { exact: true })).toBeVisible();
  });

  const date = futureDate(run, 0);
  const customerEmail = `klant.${run}@test.local`;
  let code = "";

  await test.step("CF-05: the calendar opens the booking form on the chosen day", async () => {
    await owner.goto(`/nl/app/calendar?month=${date.slice(0, 7)}`);
    // The grid also shows days of the next and previous month: match day and month.
    const label = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
    await owner.getByRole("link", { name: new RegExp(`^Boeking toevoegen op ${label}( |$)`) }).first().click();
    await expect(owner).toHaveURL(new RegExp(`/app/bookings/new\\?date=${date}`));
    await expect(owner.getByRole("link", { name: "Terug naar de agenda" })).toBeVisible();
    code = await newPhoneBooking(owner, `E2E Feedback ${run}`, customerEmail, date);
    await expect(owner.getByText("Tivoli, Utrecht")).toBeVisible();
  });

  await test.step("CF-07: the customer fills in the details through a private link", async () => {
    await owner.getByRole("button", { name: "Gegevens opvragen bij klant" }).click();
    await owner.getByRole("dialog").getByRole("button", { name: "Alleen link maken" }).click();
    const link = await owner.getByRole("dialog").getByLabel("Link").inputValue();
    expect(link).toMatch(/\/d\/[\w-]{20,}$/);
    await owner.getByRole("dialog").getByRole("button", { name: "Klaar" }).click();

    await customerPage.goto(link);
    await expect(customerPage.getByRole("heading", { name: /de gegevens van je evenement/ })).toBeVisible();
    await customerPage.getByLabel("Aantal gasten").fill("140");
    await expect(customerPage.getByLabel("Aantal gasten")).toHaveValue("140");
    await customerPage.getByLabel("Wensen en instructies").fill("Openingsdans om 21:00");
    await customerPage.getByRole("button", { name: "Gegevens versturen" }).click();
    await expect(customerPage.getByText("Bedankt!")).toBeVisible();
    // Works once.
    await customerPage.reload();
    await expect(customerPage.getByText("Deze link werkt niet")).toBeVisible();

    await owner.reload();
    await expect(owner.getByText("140 gasten")).toBeVisible();
    await expect(owner.getByText("Openingsdans om 21:00")).toBeVisible();
  });

  await test.step("CF-08/09/11: a Dutch quote with a fixed upfront amount and every line in the email", async () => {
    await owner.getByRole("button", { name: "Offerte maken" }).click();
    await owner.getByRole("button", { name: "Toevoegen uit diensten" }).click();
    await owner.getByRole("menuitem", { name: /DJ, per uur/ }).click();
    await owner.getByLabel("Aantal 1").fill("5");
    // The customer was entered by the agency: the agency's language (Dutch), and the dialog says so.
    await expect(owner.getByText("De klant krijgt de e-mail en pdf in het Nederlands.")).toBeVisible();
    await pick(owner, "Aanbetaling", "Vast bedrag");
    await owner.getByLabel("Aanbetaling (incl. btw)").fill("250,00");
    await expect(owner.getByText("Restbedrag")).toBeVisible();
    await owner.getByRole("button", { name: "Offerte versturen" }).click();
    await expect(owner.getByText("Offerte versie 1 verstuurd.")).toBeVisible();

    const mail = await mailTo(request, customerEmail, /^Je offerte van /);
    expect(mail.text).toContain("Aanbetaling bij akkoord");
    expect(mail.text).toContain("€ 250,00");
    expect(mail.text).toContain("DJ, per uur");
    expect(mail.text).toContain(code);
    expect(mail.text).toContain("geldig tot en met");
    // CF-10: signed by the agency, sent from the platform's own address.
    expect(mail.from).toMatch(/Feestband Utrecht via StageDesk <no-reply@stagedesk\.local>/);
  });

  await test.step("the agency accepts on the customer's behalf", async () => {
    await owner.getByRole("button", { name: "Namens klant accepteren" }).click();
    await owner.getByRole("dialog").getByRole("button", { name: "Offerte accepteren" }).click();
    await expect(owner.getByText("Geboekt", { exact: true }).first()).toBeVisible();
    await expect(owner.getByText("€ 250,00").first()).toBeVisible();
  });

  await test.step("CF-06/16: DJ Sem gets a fixed fee for this booking, an email and the request on his dashboard", async () => {
    await owner.getByRole("combobox", { name: "Kies een artiest" }).click();
    await owner.getByRole("option", { name: /^DJ Sem/ }).click();
    await pick(owner, "Vergoeding voor deze boeking", "Vast bedrag voor deze boeking");
    await owner.getByLabel("Vast bedrag voor deze boeking").fill("250,00");
    await owner.getByRole("button", { name: /Artiest toewijzen|Andere artiest/ }).click();
    await expect(owner.getByText("Verzoek verstuurd naar DJ Sem.")).toBeVisible();

    const mail = await mailTo(request, "dj.sem@feestband.local", /Feestband Utrecht/);
    expect(mail.subject).toMatch(/boekingsaanvraag|booking request/);
    expect(mail.text).toContain(`/app/gigs/${code}`);

    const dj = await (await browser.newContext()).newPage();
    await signIn(dj, "dj.sem@feestband.local");
    await dj.goto(`/nl/app/gigs/${code}`);
    await expect(dj.getByText("Jouw vergoeding: € 250,00")).toBeVisible();
    await dj.getByRole("button", { name: "Optreden accepteren" }).click();
    await expect(dj.getByText("Optreden geaccepteerd.")).toBeVisible();
    await dj.context().close();
  });

  await test.step("CF-03: equipment section on the booking page leads to the packing list", async () => {
    await owner.reload();
    await owner.getByRole("link", { name: "Apparatuur of pakket toevoegen" }).click();
    await expect(owner).toHaveURL(new RegExp(`/app/bookings/${code}/equipment$`));
  });

  await test.step("CF-12: a typed invoice number is used once only", async () => {
    await owner.goto("/nl/app/agency-settings");
    const card = owner.locator('[data-slot="card"]').filter({ hasText: "Zelf een factuurnummer invullen toestaan" });
    await card.getByRole("switch", { name: "Zelf een factuurnummer invullen toestaan" }).setChecked(true);
    await card.getByRole("button", { name: "Opslaan" }).click();
    await expect(owner.getByText("Factuurinstellingen opgeslagen")).toBeVisible();

    await owner.goto(`/nl/app/bookings/${code}`);
    await owner.getByRole("button", { name: "Factuur maken" }).click();
    await owner.getByRole("dialog").getByLabel("Eigen nummer (optioneel)").fill(`E2E-${run}`);
    await owner.getByRole("dialog").getByRole("button", { name: "Factuur uitgeven" }).click();
    await expect(owner.getByText(`Factuur E2E-${run.toUpperCase()} aangemaakt.`)).toBeVisible();

    // A second booking can't take the same number.
    const second = await newPhoneBooking(owner, `E2E Tweede ${run}`, `klant2.${run}@test.local`, futureDate(run, 1));
    await owner.getByRole("button", { name: "Offerte maken" }).click();
    await owner.getByRole("button", { name: "Toevoegen uit diensten" }).click();
    await owner.getByRole("menuitem", { name: /DJ, per uur/ }).click();
    await pick(owner, "Aanbetaling", "Geen aanbetaling");
    await owner.getByRole("button", { name: "Offerte versturen" }).click();
    await expect(owner.getByText("Offerte versie 1 verstuurd.")).toBeVisible();
    await expect(owner.getByText("Geen aanbetaling").first()).toBeVisible();
    await owner.getByRole("button", { name: "Namens klant accepteren" }).click();
    await owner.getByRole("dialog").getByRole("button", { name: "Offerte accepteren" }).click();
    await expect(owner.getByText("Geboekt", { exact: true }).first()).toBeVisible();
    await owner.getByRole("button", { name: "Factuur maken" }).click();
    await owner.getByRole("dialog").getByLabel("Eigen nummer (optioneel)").fill(`e2e-${run}`);
    await owner.getByRole("dialog").getByRole("button", { name: "Factuur uitgeven" }).click();
    await expect(owner.getByText("Dat factuurnummer is al gebruikt.", { exact: false })).toBeVisible();
    expect(second).toMatch(/^[A-Z2-9]{8}$/);

    await owner.goto("/nl/app/agency-settings");
    await card.getByRole("switch", { name: "Zelf een factuurnummer invullen toestaan" }).setChecked(false);
    await card.getByRole("button", { name: "Opslaan" }).click();
    await expect(owner.getByText("Factuurinstellingen opgeslagen")).toBeVisible();
  });

  await test.step("CF-14/15/17: support manages the artist, can log in as them and resends a confirmation", async () => {
    const admin = await (await browser.newContext()).newPage();
    await signIn(admin, ADMIN_EMAIL);
    await admin.goto("/nl/app/platform-artists");
    const row = admin.getByRole("row").filter({ hasText: "dj.sem@feestband.local" }).first();
    await expect(row.getByRole("button", { name: "Inloggen als artiest" })).toBeVisible();
    await row.getByRole("link", { name: "Beheren" }).click();
    await expect(admin.getByText("Supportacties", { exact: true })).toBeVisible();
    await expect(admin.getByText(code)).toBeVisible();
    await expect(admin.getByRole("button", { name: "Inloggen als artiest" })).toBeVisible();
    await expect(admin.getByText("Heeft geschiedenis en kan dus niet verwijderd worden", { exact: false })).toBeVisible();

    // The customer created by the agency has no password: resend sends a first-password link.
    await admin.goto(`/nl/app/users?q=${encodeURIComponent(customerEmail)}`);
    await admin.getByRole("button", { name: /Acties|Actions|Meer/ }).first().click();
    await admin.getByRole("menuitem", { name: "Bevestigingsmail opnieuw sturen" }).click();
    await expect(admin.getByText("Dit account heeft nog geen wachtwoord", { exact: false })).toBeVisible();
    await admin.context().close();
  });

  await owner.context().close();
  await customerPage.context().close();
});
