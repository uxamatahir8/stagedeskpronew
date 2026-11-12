import { expect, test } from "@playwright/test";
import { closeBrowserContexts, signIn } from "./helpers";

/** Client report of 11 November 2026: an agency's artist couldn't update their own profile. */
test.afterEach(async ({ browser }) => closeBrowserContexts(browser));

test("an agency's artist edits how they're presented at the agency", async ({ page }) => {
  const run = Date.now().toString(36);
  await signIn(page, "dj.sem@feestband.local");
  await page.goto("/nl/app");
  await page.getByRole("link", { name: "Artiestenprofiel" }).first().click();
  await expect(page).toHaveURL(/\/app\/artist-profile$/);
  await expect(page.getByText("Je profiel bij Feestband Utrecht")).toBeVisible();

  const bio = page.getByLabel("Over jou");
  await bio.fill(`Bruiloften en bedrijfsfeesten (${run})`);
  await page.getByRole("button", { name: "Profiel opslaan" }).click();
  await expect(page.getByText("Profiel opgeslagen.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Over jou")).toHaveValue(`Bruiloften en bedrijfsfeesten (${run})`);
  // Pay and visibility stay with the agency: those fields aren't here.
  await expect(page.getByLabel(/Aandeel|vergoeding/i)).toHaveCount(0);
});
