import { expect, test } from "@playwright/test";
import { closeBrowserContexts, signIn } from "./helpers";

/** The client's production-readiness QA report of 8 November 2026 (SD-xx), as people meet it on screen. */
test.afterEach(async ({ browser }) => closeBrowserContexts(browser));

const MAILPIT = "http://localhost:8025/api/v1";
const run = Date.now().toString(36);
const days = (n: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date(Date.now() + n * 86_400_000));

test("SD-04: a service can't have a negative price", async ({ page }) => {
  await signIn(page, "eigenaar@feestband.local");
  await page.goto("/nl/app/services");
  await page.getByRole("button", { name: "Dienst toevoegen" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Naam", { exact: true }).fill(`Neg ${run}`);
  await dialog.getByLabel("Prijs excl. btw").fill("-50");
  await dialog.getByRole("button", { name: /Opslaan|Toevoegen/ }).click();
  await expect(page.getByText("Een dienst kan niet minder dan nul kosten.", { exact: false })).toBeVisible();
});

test("SD-12: an invalid VAT number is refused with a message", async ({ page }) => {
  await signIn(page, "eigenaar@feestband.local");
  await page.goto("/nl/app/agency-settings");
  await page.getByLabel("Btw-nummer").fill("XX123");
  await page.getByRole("button", { name: "Opslaan" }).first().click();
  await expect(page.getByText("Gebruik het formaat NL123456789B01.")).toBeVisible();
  await expect(page.getByLabel("Btw-nummer")).toHaveValue("XX123");
});

test("SD-21: customers don't get a blog menu, and restricted pages don't send them to an owner", async ({ page }) => {
  await signIn(page, "sanne@klant.local");
  await page.goto("/nl/app");
  await expect(page.getByRole("link", { name: "Home" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Mijn blogartikelen" })).toHaveCount(0);
  await page.goto("/nl/app/bookings");
  await expect(page.getByText("Deze pagina hoort niet bij je account.")).toBeVisible();
});

test.describe.serial("a booking that's quoted, declined, booked, paid and cancelled", () => {
  let code = "";
  let quoteLink = "";

  test("SD-15: the customer declines a quote from the link and the agency sees it", async ({ page, browser }) => {
    await signIn(page, "eigenaar@feestband.local");
    await page.goto("/nl/app/bookings/new");
    await page.getByRole("tab", { name: "Nieuwe klant" }).click();
    await page.getByLabel("Naam van de klant").fill(`Klant Rapport ${run}`);
    await page.getByLabel("E-mailadres").fill(`rapport.${run}@test.local`);
    await page.getByLabel("Datum").fill(days(90));
    await page.getByRole("button", { name: "Boeking aanmaken" }).click();
    await expect(page).toHaveURL(/\/app\/bookings\/[A-Z2-9]{8}$/, { timeout: 30_000 });
    code = page.url().split("/").pop()!;
    await page.getByRole("button", { name: "Offerte maken" }).click();
    await page.getByLabel("Omschrijving 1").fill("DJ");
    await page.getByLabel("Prijs excl. btw 1").fill("500");
    await page.getByRole("button", { name: "Offerte versturen" }).click();
    await expect(page.getByText("Offerte versie 1 verstuurd.")).toBeVisible();
    // The link as the customer gets it, from the quote email.
    await expect(async () => {
      const search = await (await page.request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:rapport.${run}@test.local`)}`)).json();
      for (const m of search.messages ?? []) quoteLink = ((await (await page.request.get(`${MAILPIT}/message/${m.ID}`)).json()).Text as string).match(/https?:\/\/\S+\/q\/[\w-]+/)?.[0] ?? quoteLink;
      expect(quoteLink).toContain("/q/");
    }).toPass({ timeout: 30_000 });

    const customer = await (await browser.newContext()).newPage();
    await customer.goto(quoteLink);
    await customer.getByRole("button", { name: "Offerte afwijzen" }).click();
    await customer.getByRole("dialog").getByLabel("Reden (optioneel)").fill("Te duur voor ons");
    await customer.getByRole("dialog").getByRole("button", { name: "Offerte afwijzen" }).click();
    await expect(customer.getByText("Je hebt deze offerte afgewezen.", { exact: false })).toBeVisible();

    await page.goto(`/nl/app/bookings/${code}`);
    await expect(page.getByText(/heeft offerte v1 afgewezen/)).toBeVisible();
  });

  test("SD-05 and SD-02: cancelling with money paid asks what happens to it; nothing is due after; the email is logged", async ({ page }) => {
    await signIn(page, "eigenaar@feestband.local");
    await page.goto(`/nl/app/bookings/${code}`);
    await page.getByRole("button", { name: /Nieuwe versie sturen|Offerte maken/ }).click();
    await page.getByRole("button", { name: "Offerte versturen" }).click();
    await expect(page.getByText(/Offerte versie 2 verstuurd\./)).toBeVisible();
    await page.getByRole("button", { name: "Namens klant accepteren" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Offerte accepteren" }).click();
    await page.getByRole("button", { name: "Betaling vastleggen" }).click({ timeout: 30_000 });
    const pay = page.getByRole("dialog");
    await pay.getByLabel("Bedrag (€)").fill("100");
    await pay.getByRole("button", { name: "Betaling vastleggen" }).click();
    await expect(page.getByText("Betaling vastgelegd.")).toBeVisible();

    await page.getByRole("button", { name: "Boeking annuleren" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/De klant heeft €\s?100,00 betaald/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Boeking annuleren" })).toBeDisabled();
    await dialog.getByLabel("Houden als annuleringskosten").check();
    await dialog.getByRole("button", { name: "Boeking annuleren" }).click();
    await expect(page.getByText("gehouden als annuleringskosten", { exact: false }).first()).toBeVisible({ timeout: 30_000 });
    // Nothing is due on a cancelled booking.
    await expect(page.getByText("Nog te betalen").locator("..")).toContainText(/€\s0,00/);
    // The cancellation email to the customer shows on the booking's email log.
    await page.reload();
    await expect(page.getByText("Boeking geannuleerd").first()).toBeVisible();
  });
});
