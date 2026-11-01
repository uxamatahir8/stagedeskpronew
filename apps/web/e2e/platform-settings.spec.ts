import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, signIn } from "./helpers";

/** Phase 5: the platform admin edits platform rules and a per-agency fee deal. */
test("platform admin changes subscription rules and an agency fee deal", async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);

  await test.step("grace days are saved and shown again after a reload", async () => {
    await page.goto("/nl/app/settings");
    const grace = page.getByLabel("Respijtdagen na mislukte betaling of verlopen proefperiode");
    const before = await grace.inputValue();
    await grace.fill("9");
    await grace.locator("xpath=ancestor::*[@data-slot='card']").getByRole("button", { name: "Opslaan" }).click();
    await expect(page.getByText("Instellingen opgeslagen.")).toBeVisible();
    await page.reload();
    await expect(grace).toHaveValue("9");

    await grace.fill(before);
    await grace.locator("xpath=ancestor::*[@data-slot='card']").getByRole("button", { name: "Opslaan" }).click();
    await expect(page.getByText("Instellingen opgeslagen.").first()).toBeVisible();
  });

  await test.step("an invalid number is refused", async () => {
    const expiry = page.getByLabel("Offertes geldig (dagen)");
    await expiry.fill("veertien");
    await expiry.locator("xpath=ancestor::*[@data-slot='card']").getByRole("button", { name: "Opslaan" }).click();
    await expect(page.getByText("Sommige waarden kloppen niet.", { exact: false })).toBeVisible();
  });

  await test.step("a fee deal is set for one agency and removed again", async () => {
    await page.goto("/nl/app/agencies");
    const row = page.getByRole("row").filter({ hasText: "Rotterdam DJ Collectief" });
    await row.getByRole("button", { name: "Kostenafspraak" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("switch").click();
    await dialog.getByRole("button", { name: "Opslaan" }).click();
    await expect(page.getByText("Kostenafspraak opgeslagen.")).toBeVisible();

    await row.getByRole("button", { name: "Kostenafspraak" }).click();
    await page.getByRole("dialog").getByRole("switch").click();
    await page.getByRole("dialog").getByRole("button", { name: "Opslaan" }).click();
    await expect(page.getByText("Kostenafspraak opgeslagen.").first()).toBeVisible();
  });
});
