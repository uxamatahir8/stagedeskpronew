import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

const MAILPIT = "http://localhost:8025/api/v1";

/** A date ~4 months ahead as YYYY-MM-DD. */
function futureDate() {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + 4);
  return d.toISOString().slice(0, 10);
}

test("a bot that fills the hidden honeypot field gets a thank-you but creates nothing", async ({ page, browser }) => {
  const name = `Bot ${Date.now().toString(36)}`;
  await page.goto("/nl/b/feestband-utrecht");
  await page.getByLabel("Datum").fill(futureDate());
  await page.getByLabel("Plaats").fill("Spamstad");
  await page.getByLabel("Naam", { exact: true }).fill(name);
  await page.getByLabel("E-mailadres").fill("bot@test.local");
  await page.locator('input[name="website"]').fill("https://spam.example", { force: true });
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 30_000 });
  await page.getByRole("button", { name: "Aanvraag versturen" }).click();
  await expect(page.getByRole("heading", { name: /Bedankt/ })).toBeVisible();

  const owner = await (await browser.newContext()).newPage();
  await signIn(owner, "eigenaar@feestband.local");
  await owner.goto(`/nl/app/bookings?q=${encodeURIComponent(name)}`);
  await expect(owner.getByText("Niets gevonden", { exact: false })).toBeVisible();
});

/**
 * Phase 4 acceptance: a visitor submits an inquiry on the public booking page
 * and it appears in the agency's action queue.
 */
test("a visitor's inquiry lands in the agency's action queue", async ({ page, browser, request }) => {
  const run = Date.now().toString(36);
  const name = `Bezoeker ${run}`;
  const email = `bezoeker.${run}@test.local`;

  await test.step("visitor fills in the booking page form", async () => {
    await page.goto("/nl/b/feestband-utrecht");
    await expect(page.getByRole("heading", { name: "Feestband Utrecht", level: 1 })).toBeVisible();
    await page.getByRole("link", { name: "Vraag een offerte aan" }).first().click();

    // Wedding is the default type, so the wedding-only fields are shown.
    await expect(page.getByLabel("Naam van je partner")).toBeVisible();
    await page.getByLabel("Datum").fill(futureDate());
    await page.getByLabel("Plaats").fill("Amersfoort");
    await page.getByLabel("Aantal gasten (optioneel)").fill("110");
    await page.getByLabel("Naam van je partner").fill(`Jesse ${run}`);
    await page.getByLabel("We willen ook muziek tijdens de ceremonie").check();
    await page.getByRole("combobox", { name: "Budget (optioneel)" }).click();
    await page.getByRole("option", { name: "€ 1.500 – € 2.500" }).click();
    await page.getByLabel("Muziekstijl (optioneel)").fill("Nederlandstalig en 90s");
    await page.getByLabel("Naam", { exact: true }).fill(name);
    await page.getByLabel("E-mailadres").fill(email);
    await page.getByLabel("Wil je nog iets kwijt? (optioneel)").fill("Graag een dj die ook de ceremonie kan doen.");

    // Wait for Turnstile (Cloudflare's always-pass test key) to issue its token.
    await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 30_000 });
    // People take more than 3 seconds to fill in the form; faster submissions are treated as bots.
    await page.waitForTimeout(3_500);
    await page.getByRole("button", { name: "Aanvraag versturen" }).click();
    await expect(page.getByRole("heading", { name: `Bedankt, Bezoeker!` })).toBeVisible();
  });

  await test.step("confirmation and agency emails are sent", async () => {
    await expect
      .poll(async () => (await (await request.get(`${MAILPIT}/search?query=to:${email}`)).json()).messages_count, { timeout: 15_000 })
      .toBe(1);
    await expect
      .poll(async () => (await (await request.get(`${MAILPIT}/search?query=subject:"New inquiry from ${name}"`)).json()).messages_count, {
        timeout: 15_000,
      })
      .toBeGreaterThanOrEqual(1);
  });

  await test.step("the owner sees it in the action queue and opens it", async () => {
    const owner = await (await browser.newContext()).newPage();
    await signIn(owner, "eigenaar@feestband.local");
    const item = owner.getByRole("link", { name: new RegExp(`Nieuwe aanvraag van ${name}`) });
    await expect(item).toBeVisible();
    await expect(item).toContainText("via boekingspagina");
    await item.click();
    await expect(owner.getByText("Nederlandstalig en 90s")).toBeVisible();
    await expect(owner.getByText("€ 1.500 – € 2.500")).toBeVisible();
    await expect(owner.getByText(`Jesse ${run}`)).toBeVisible();
    await expect(owner.getByText("Aanvraag", { exact: true }).first()).toBeVisible();
  });
});
