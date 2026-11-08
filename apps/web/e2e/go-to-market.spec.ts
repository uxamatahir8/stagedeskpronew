import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, signIn } from "./helpers";

/** The go-to-market review: one audience on the agency homepage, honest fees, and the marketplace switch. */
test("the agency homepage speaks to agencies and shows Stripe's cost in the example", async ({ page }) => {
  await page.goto("/nl");
  const main = page.locator("main");
  await expect(main.getByText("Stripe-betaalkosten")).toBeVisible();
  await expect(main.getByText("met iDEAL | Wero", { exact: false }).first()).toBeVisible();
  // No consumer request blocks or links on the agency homepage.
  await expect(main.locator('a[href$="/request"]')).toHaveCount(0);
});

test("the platform admin can close the marketplace, and /request says so", async ({ page }) => {
  await signIn(page, ADMIN_EMAIL);
  await page.goto("/nl/app/settings");
  const card = page.locator("[data-slot='card']").filter({ has: page.getByText("Marktplaats", { exact: true }) });
  const toggle = card.getByRole("switch", { name: "Aanvragen aannemen" });
  await expect(toggle).toBeVisible();
  const wasOn = (await toggle.getAttribute("aria-checked")) === "true";

  try {
    if (wasOn) await toggle.click();
    await card.getByRole("button", { name: "Opslaan" }).click();
    await expect(page.getByText("Instellingen opgeslagen.").first()).toBeVisible();

    await page.goto("/nl/request");
    await expect(page.getByText("Nog niet geopend")).toBeVisible();
  } finally {
    // Put it back the way it was, for the other specs.
    await page.goto("/nl/app/settings");
    const again = page.locator("[data-slot='card']").filter({ has: page.getByText("Marktplaats", { exact: true }) });
    const on = (await again.getByRole("switch", { name: "Aanvragen aannemen" }).getAttribute("aria-checked")) === "true";
    if (on !== wasOn) await again.getByRole("switch", { name: "Aanvragen aannemen" }).click();
    await again.getByRole("button", { name: "Opslaan" }).click();
    await expect(page.getByText("Instellingen opgeslagen.").first()).toBeVisible();
  }
});
