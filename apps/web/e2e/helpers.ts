import { expect, type Page } from "@playwright/test";

export const DEMO_PASSWORD = "StageDesk-demo-2026";

export async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.locator("#signin-email").fill(email);
  await page.locator("#signin-password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Inloggen", exact: true }).click();
  await expect(page).toHaveURL(/\/app$/);
}

/** Today's date in the Netherlands as YYYY-MM-DD. */
export function todayNl() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
}
