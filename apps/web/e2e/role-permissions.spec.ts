import { expect, test } from "@playwright/test";
import { closeBrowserContexts, signIn } from "./helpers";

/**
 * An owner takes a right away from staff: the page and the menu follow, and
 * restoring the defaults gives it back. Restores the demo agency on the way out.
 */
test("an owner's custom role takes effect for staff, and can be reset", async ({ browser }) => {
  test.setTimeout(240_000);
  const owner = await (await browser.newContext()).newPage();
  const staff = await (await browser.newContext()).newPage();
  owner.on("dialog", (d) => d.accept());
  await signIn(owner, "eigenaar@feestband.local");
  await signIn(staff, "planning@feestband.local");

  const reset = async () => {
    await owner.goto("/nl/app/team?tab=roles");
    const button = owner.getByRole("button", { name: "Standaard herstellen" });
    if (await button.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await button.click();
      await expect(owner.getByRole("button", { name: "Standaard herstellen" })).toHaveCount(0, { timeout: 30_000 });
    }
  };

  try {
    await reset();

    await test.step("by default staff may create bookings", async () => {
      await staff.goto("/nl/app/bookings/new");
      await expect(staff.getByRole("button", { name: "Boeking aanmaken" })).toBeVisible();
    });

    await test.step("the owner turns that off for staff", async () => {
      await owner.goto("/nl/app/team?tab=roles");
      const toggle = owner.getByRole("switch", { name: "Medewerker: Boekingen aanmaken" });
      await expect(toggle).toBeChecked();
      await toggle.click();
      await owner.getByRole("button", { name: "Rechten opslaan" }).click();
      await expect(owner.getByRole("button", { name: "Standaard herstellen" })).toBeVisible({ timeout: 30_000 });
    });

    await test.step("staff are refused the page, and can still see bookings", async () => {
      await staff.goto("/nl/app/bookings/new");
      await expect(staff.getByRole("button", { name: "Boeking aanmaken" })).toHaveCount(0);
      await staff.goto("/nl/app/bookings");
      await expect(staff.locator('[data-slot="sidebar"]').first().getByRole("link", { name: "Boekingen" })).toBeVisible();
    });

    await test.step("an admin keeps it", async () => {
      const admin = await (await browser.newContext()).newPage();
      await signIn(admin, "beheer@feestband.local");
      await admin.goto("/nl/app/bookings/new");
      await expect(admin.getByRole("button", { name: "Boeking aanmaken" })).toBeVisible();
    });

    await test.step("restoring the defaults gives it back", async () => {
      await reset();
      await staff.goto("/nl/app/bookings/new");
      await expect(staff.getByRole("button", { name: "Boeking aanmaken" })).toBeVisible();
    });
  } finally {
    await reset().catch(() => undefined);
    await closeBrowserContexts(browser);
  }
});
