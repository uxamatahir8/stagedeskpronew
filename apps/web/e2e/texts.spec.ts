import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, signIn } from "./helpers";

/**
 * The platform admin changes the home page headline: a placeholder the text
 * doesn't know is refused, a valid change shows on the site, and resetting
 * brings the original back.
 */
test("website texts from the admin panel", async ({ browser }) => {
  test.setTimeout(120_000);
  const admin = await (await browser.newContext()).newPage();
  const visitor = await (await browser.newContext()).newPage();
  await signIn(admin, ADMIN_EMAIL);
  await admin.goto("/nl/app/texts?ns=landing");
  const field = admin.locator('textarea[id="nl-landing.title"]');

  await test.step("an unknown placeholder is refused", async () => {
    await field.fill("Van aanvraag tot {iets}");
    await admin.getByRole("button", { name: "Opslaan" }).first().click();
    await expect(admin.getByText("Deze namen kent de tekst niet", { exact: false })).toBeVisible();
  });

  await test.step("a valid change is live on the home page", async () => {
    await field.fill("Je hele bureau, <hl>één systeem</hl>");
    await admin.getByRole("button", { name: "Opslaan" }).first().click();
    await expect(admin.getByText("Tekst opgeslagen en live.")).toBeVisible();
    await visitor.goto("/nl/");
    await expect(visitor.getByRole("heading", { level: 1 })).toHaveText("Je hele bureau, één systeem");
  });

  await test.step("resetting brings the original back", async () => {
    await admin.reload();
    await admin.getByRole("button", { name: "Terugzetten" }).first().click();
    await expect(admin.getByText("Oorspronkelijke tekst teruggezet.")).toBeVisible();
    await visitor.reload();
    await expect(visitor.getByRole("heading", { level: 1 })).toHaveText("Van aanvraag tot uitbetaling, zonder spreadsheets");
  });
});
