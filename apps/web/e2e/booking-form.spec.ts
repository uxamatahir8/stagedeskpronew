import { expect, test } from "@playwright/test";
import { closeBrowserContexts, signIn } from "./helpers";

/**
 * Client report of 11 November 2026: bookings other than weddings, and bookings
 * for an existing customer, didn't save. The partner field (weddings only) and
 * the new-customer tab aren't on the page then, and their absence failed the
 * form without a visible message.
 */
test.afterEach(async ({ browser }) => closeBrowserContexts(browser));

const inDays = (n: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date(Date.now() + n * 86_400_000));

test("a corporate booking for an existing customer is created, and an artist can be asked right away", async ({ page }) => {
  await signIn(page, "eigenaar@feestband.local");
  await page.goto("/nl/app/bookings/new");
  await page.getByRole("tab", { name: "Bestaande klant" }).click();
  await page.getByLabel("Klant", { exact: true }).click();
  await page.getByRole("option", { name: /sanne@klant\.local/ }).click();
  await page.getByLabel("Soort evenement").click();
  await page.getByRole("option", { name: /Bedrijf/ }).first().click();
  await expect(page.getByLabel("Naam partner")).toHaveCount(0);
  await page.getByLabel("Datum").fill(inDays(120));
  await page.getByRole("button", { name: "Boeking aanmaken" }).click();
  await expect(page).toHaveURL(/\/app\/bookings\/[A-Z2-9]{8}$/, { timeout: 30_000 });
  // Still an inquiry: the DJ can be lined up before the quote is accepted.
  await expect(page.getByText("Je kunt nu al een artiest vragen", { exact: false })).toBeVisible();
});

test("a new customer's wedding still needs a valid email, and says so", async ({ page }) => {
  await signIn(page, "eigenaar@feestband.local");
  await page.goto("/nl/app/bookings/new");
  await page.getByRole("tab", { name: "Nieuwe klant" }).click();
  await page.getByLabel("Naam van de klant").fill("Test Bruiloft");
  // The browser's own check would stop "not-an-email"; this one passes it but not ours.
  await page.getByLabel("E-mailadres").fill("bruiloft@localhost");
  await page.getByLabel("Datum").fill(inDays(150));
  await page.getByRole("button", { name: "Boeking aanmaken" }).click();
  await expect(page.getByText("Niet alles is goed ingevuld", { exact: false })).toBeVisible();
  await expect(page).toHaveURL(/\/app\/bookings\/new/);
});
