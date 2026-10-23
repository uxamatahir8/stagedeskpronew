import { expect, type Page } from "@playwright/test";

export const DEMO_PASSWORD = "StageDesk-demo-2026";

export async function signIn(page: Page, email: string) {
  await submitSignIn(page, email);
  await settleOnDashboard(page);
}

/**
 * Submits the sign-in form. The app allows 10 sign-ins a minute per IP; a
 * full test run can hit that, so on "too many attempts" this waits out the
 * window and tries once more instead of loosening the limit.
 */
export async function submitSignIn(page: Page, email: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto("/sign-in");
    await page.locator("#signin-email").fill(email);
    await page.locator("#signin-password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Inloggen", exact: true }).click();
    const limited = page.getByText("Te veel pogingen", { exact: false });
    await expect(limited.or(page.locator('[data-slot="sidebar"]')).or(page.getByLabel(/Ik ga akkoord/)).first()).toBeVisible({ timeout: 30_000 });
    if (!(await limited.isVisible())) return;
    await page.waitForTimeout(61_000);
  }
  throw new Error("Sign-in still rate limited after waiting a minute");
}

/**
 * Waits until the dashboard is really there. New Terms are put to the user
 * at the first sign-in after they're published; that redirect can arrive
 * after the URL already shows /app (it's decided inside the streamed shell).
 */
export async function settleOnDashboard(page: Page) {
  const gate = page.getByLabel(/Ik ga akkoord/);
  const shell = page.locator('[data-slot="sidebar"]').first();
  await expect(gate.or(shell)).toBeVisible({ timeout: 30_000 });
  if (await gate.isVisible()) {
    await acceptTerms(page);
    await expect(shell).toBeVisible({ timeout: 30_000 });
  }
  await expect(page).toHaveURL(/\/app$/);
}

export async function acceptTerms(page: Page) {
  await page.getByLabel(/Ik ga akkoord/).check();
  await page.getByRole("button", { name: "Doorgaan" }).click();
}

/** Today's date in the Netherlands as YYYY-MM-DD. */
export function todayNl() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
}
