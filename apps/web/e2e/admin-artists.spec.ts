import { expect, type Page, test } from "@playwright/test";
import { ADMIN_EMAIL, closeBrowserContexts, signIn } from "./helpers";

/**
 * Client report of 11 November 2026: the platform admin adds an artist with a
 * percentage or a fixed fee (or as an independent artist), and changes where
 * an artist works, e.g. from an agency's DJ to an independent artist.
 */
test.afterEach(async ({ browser }) => closeBrowserContexts(browser));

/** The app's searchable select: open it by its label and pick the option. */
async function choose(page: Page, label: string, option: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test("the admin adds a managed artist on a fixed fee, then makes them independent", async ({ page }) => {
  const run = Date.now().toString(36);
  const stage = `E2E Fixed ${run}`;
  await signIn(page, ADMIN_EMAIL);
  await page.goto("/nl/app/platform-artists");

  await page.getByLabel("Artiestennaam").fill(stage);
  await page.getByLabel("E-mailadres artiest").fill(`fixed.${run}@test.local`);
  await choose(page, "Vergoeding", "Vast bedrag per boeking");
  await page.getByLabel("Bedrag per boeking (EUR)").fill("250,00");
  await page.getByRole("button", { name: "Account maken en uitnodigen" }).click();
  await expect(page.getByText(`${stage} is aangemaakt`, { exact: false })).toBeVisible();

  const row = page.getByRole("row").filter({ hasText: stage });
  await row.getByRole("button", { name: "Rol wijzigen" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: `Rol van ${stage} wijzigen` })).toBeVisible();
  await choose(page, "Nieuwe rol", "Zelfstandige artiest (eigen onderneming)");
  await dialog.getByLabel("Reden").fill("Gaat zelfstandig verder");
  await dialog.getByRole("button", { name: "Rol wijzigen" }).click();
  await expect(page.getByText("De rol van de artiest is gewijzigd")).toBeVisible();
  // The new independent profile is listed as such.
  await expect(page.getByRole("row").filter({ hasText: stage }).filter({ hasText: "Zelfstandig" })).toHaveCount(1);
});

test("the admin adds an independent artist straight away", async ({ page }) => {
  const run = Date.now().toString(36);
  const stage = `E2E Solo Admin ${run}`;
  await signIn(page, ADMIN_EMAIL);
  await page.goto("/nl/app/platform-artists");
  await page.getByLabel("Artiestennaam").fill(stage);
  await page.getByLabel("E-mailadres artiest").fill(`solo.admin.${run}@test.local`);
  await choose(page, "Werkt voor", "Zelfstandige artiest (eigen onderneming)");
  await expect(page.getByLabel("Vergoeding")).toHaveCount(0);
  await page.getByRole("button", { name: "Account maken en uitnodigen" }).click();
  await expect(page.getByText(`${stage} staat klaar`, { exact: false })).toBeVisible();
  await page.goto(`/nl/app/independent-artists?q=${encodeURIComponent(stage)}`);
  await expect(page.getByText(stage).first()).toBeVisible();
});
