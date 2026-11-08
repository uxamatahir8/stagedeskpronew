import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, signIn } from "./helpers";

/** Promo codes: an agency's code on a booking and in the quote, and the platform's codes for plans. */
const run = Date.now().toString(36).toUpperCase();
const code = `E2E-${run}`;

function futureDate() {
  const d = new Date();
  d.setMonth(d.getMonth() + 4);
  return d.toISOString().slice(0, 10);
}

test("an agency code is used on the booking page and becomes a discount on the quote", async ({ browser }) => {
  const owner = await (await browser.newContext()).newPage();
  await signIn(owner, "eigenaar@feestband.local");

  await test.step("the agency makes a 10% code", async () => {
    await owner.goto("/nl/app/promo-codes");
    await owner.getByRole("button", { name: "Nieuwe code" }).click();
    const dialog = owner.getByRole("dialog");
    await dialog.getByLabel("Code", { exact: true }).fill(code.toLowerCase());
    await dialog.getByLabel("Percentage korting").fill("10");
    await dialog.getByRole("button", { name: "Opslaan" }).click();
    await expect(owner.getByText(`Code ${code} opgeslagen.`)).toBeVisible();
    await expect(owner.getByRole("cell", { name: code, exact: true }).first()).toBeVisible();
  });

  const name = `Promo ${run}`;
  await test.step("a customer can't use a wrong code, and uses the real one", async () => {
    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto("/nl/b/feestband-utrecht");
    await visitor.getByRole("link", { name: "Vraag een offerte aan" }).first().click();
    await visitor.getByLabel("Datum").fill(futureDate());
    await visitor.getByLabel("Plaats").fill("Utrecht");
    await visitor.getByLabel("Naam", { exact: true }).fill(name);
    await visitor.getByLabel("E-mailadres").fill(`promo-${run.toLowerCase()}@test.local`);
    await visitor.getByLabel("Kortingscode (optioneel)").fill("NOT-A-CODE");
    // Wait for Turnstile's token (Cloudflare's always-pass test key), as the inquiry spec does.
    await expect(visitor.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 30_000 });
    await visitor.waitForTimeout(3_500); // the form refuses submissions faster than 3 s
    await visitor.getByRole("button", { name: "Aanvraag versturen" }).click();
    await expect(visitor.getByText("Deze kortingscode kennen we niet.", { exact: false })).toBeVisible();
    await visitor.getByLabel("Kortingscode (optioneel)").fill(code.toLowerCase());
    // After a refused submit the CAPTCHA resets; wait for its new token.
    await visitor.waitForTimeout(1_000);
    await expect(visitor.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 30_000 });
    await visitor.getByRole("button", { name: "Aanvraag versturen" }).click();
    await expect(visitor.getByRole("heading", { name: /Bedankt/ })).toBeVisible({ timeout: 60_000 });
  });

  await test.step("staff add the discount in the quote editor", async () => {
    await owner.goto(`/nl/app/bookings?q=${encodeURIComponent(name)}`);
    await owner.getByRole("link").filter({ hasText: name }).first().click();
    await owner.getByRole("button", { name: /Offerte maken|Nieuwe versie sturen/ }).click();
    await expect(owner.getByText(`De klant gebruikte code ${code}`, { exact: false })).toBeVisible();
    await owner.getByLabel("Omschrijving 1").fill("DJ");
    await owner.getByLabel("Prijs excl. btw 1").fill("1000");
    await owner.getByRole("button", { name: "Korting toevoegen" }).click();
    await expect(owner.getByLabel("Omschrijving 2")).toHaveValue(`Korting (${code})`);
    await expect(owner.getByLabel("Prijs excl. btw 2")).toHaveValue("-100,00");
  });
});

test("an unknown plan code is refused on Billing with a reason", async ({ page }) => {
  await signIn(page, "eigenaar@feestband.local");
  await page.goto("/nl/app/billing");
  await page.getByRole("button", { name: "Heb je een kortingscode?" }).click();
  await page.getByLabel("Kortingscode", { exact: true }).fill("NO-SUCH-CODE");
  // A plan the agency isn't on: the code is checked before anything goes to Stripe.
  await page.getByRole("main").getByRole("button", { name: /Starter/ }).click();
  await expect(page.getByText("Deze kortingscode kennen we niet.", { exact: false })).toBeVisible();
});

test("the platform admin makes a plan code", async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);
  await page.goto("/nl/app/subscription-codes");
  await page.getByRole("button", { name: "Nieuwe code" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Code", { exact: true }).fill(`E2E-PILOT-${run}`);
  await dialog.getByLabel("Percentage korting").fill("50");
  await dialog.getByRole("button", { name: "Code maken" }).click();
  await expect(page.getByText(`Code E2E-PILOT-${run} gemaakt.`)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(`E2E-PILOT-${run}`, { exact: true }).first()).toBeVisible();
  // Switched off again so it doesn't linger as an active code.
  await page.getByRole("switch", { name: `E2E-PILOT-${run} actief` }).click();
  await expect(page.getByText("Code uitgezet.")).toBeVisible();
});
