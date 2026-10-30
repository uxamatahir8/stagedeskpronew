import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// The platform admin who logs in as someone else; override when your local admin has another password.
const ADMIN = process.env["E2E_ADMIN_EMAIL"] ?? "admin@stagedesk.local";

/**
 * "Log in as": a platform admin opens the agency owner's account, works there
 * as them, can't touch their sign-in details, and returns to their own account.
 */
test("a platform admin logs in as a user and returns", async ({ page, baseURL }) => {
  await signIn(page, ADMIN);

  await test.step("start from the users list", async () => {
    await page.goto("/nl/app/users?q=eigenaar@feestband.local");
    await page.getByRole("button", { name: "Acties voor Mark de Boer" }).click();
    await page.getByRole("menuitem", { name: "Inloggen als deze gebruiker" }).click();
    await expect(page).toHaveURL(/\/nl\/app$/);
    await expect(page.getByText("Je bent ingelogd als", { exact: false })).toBeVisible();
    await expect(page.getByText("Mark de Boer").first()).toBeVisible();
    // The owner's own agency pages are open, as for them.
    await page.goto("/nl/app/agency-settings");
    await expect(page.getByRole("textbox", { name: "Naam van het bureau" })).toHaveValue("Feestband Utrecht");
  });

  await test.step("their sign-in details stay out of reach", async () => {
    const res = await page.request.post("/api/auth/change-password", {
      headers: { origin: baseURL! },
      data: { currentPassword: "whatever-it-is", newPassword: "Another-Pass-2026!" },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).code).toBe("IMPERSONATION_BLOCKED");
  });

  await test.step("return to the admin's own account", async () => {
    await page.getByRole("button", { name: "Terug naar mijn account" }).click();
    await expect(page).toHaveURL(/\/nl\/app\/users\?q=/);
    await expect(page.getByText("Je bent ingelogd als", { exact: false })).toHaveCount(0);
    await page.goto("/nl/app/audit?group=impersonation");
    await expect(page.getByText("Ingelogd als een gebruiker").first()).toBeVisible();
    await expect(page.getByText("Teruggekeerd uit het account van een gebruiker").first()).toBeVisible();
  });
});
