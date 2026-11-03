import { expect, type Page } from "@playwright/test";

export const DEMO_PASSWORD = "StageDesk-demo-2026";

/**
 * The platform admin the specs sign in as. Locally the demo admin may have its
 * own password, so without E2E_ADMIN_PASSWORD it signs in with an emailed code
 * (Mailpit); E2E_ADMIN_EMAIL points the specs at another admin.
 */
export const ADMIN_EMAIL = process.env["E2E_ADMIN_EMAIL"] ?? "admin@stagedesk.local";
const ADMIN_PASSWORD = process.env["E2E_ADMIN_PASSWORD"] ?? DEMO_PASSWORD;
/** That admin's display name, for checks that name who did something. */
export const ADMIN_NAME = process.env["E2E_ADMIN_NAME"] ?? "Iris Platform";

export function passwordFor(email: string) {
  return email === ADMIN_EMAIL ? ADMIN_PASSWORD : DEMO_PASSWORD;
}

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
  // The local demo admin may have its own password: without E2E_ADMIN_PASSWORD it signs in with an emailed code.
  const byCode = email === ADMIN_EMAIL && !process.env["E2E_ADMIN_PASSWORD"];
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto("/nl/sign-in");
    if (byCode) {
      await signInWithMailedCode(page, email);
    } else {
      await page.locator("#signin-email").fill(email);
      await page.locator("#signin-password").fill(passwordFor(email));
      await page.getByRole("button", { name: "Inloggen", exact: true }).click();
    }
    const limited = page.getByText("Te veel pogingen", { exact: false });
    // Navigation is the durable sign-in boundary. The streamed dashboard can
    // still be a skeleton while a cold development server compiles the route;
    // settleOnDashboard waits for its interactive shell separately.
    await expect(async () => {
      const signedIn = /\/(?:nl\/)?(?:app|accept-terms)(?:\/|$)/.test(new URL(page.url()).pathname);
      expect(signedIn || (await limited.isVisible())).toBe(true);
    }).toPass({ timeout: 30_000 });
    if (!(await limited.isVisible())) return;
    await page.waitForTimeout(61_000);
  }
  throw new Error("Sign-in still rate limited after waiting a minute");
}

const MAILPIT = "http://localhost:8025/api/v1";

/** The code tab of the sign-in page, with the newest code Mailpit received for `email`. */
async function signInWithMailedCode(page: Page, email: string) {
  const ids = async () => {
    const search = await (await page.request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
    return (search.messages ?? []) as { ID: string }[];
  };
  const seen = new Set((await ids()).map((m) => m.ID));
  await page.getByRole("tab", { name: "Code per e-mail" }).click();
  await page.locator("#signin-code-email").fill(email);
  await page.getByRole("button", { name: "Mail me een code" }).click();
  let code = "";
  await expect(async () => {
    for (const m of await ids()) {
      if (seen.has(m.ID)) continue;
      const text = (await (await page.request.get(`${MAILPIT}/message/${m.ID}`)).json()).Text as string;
      code = text.match(/\b(\d{6})\b/)?.[1] ?? "";
      if (code) break;
    }
    expect(code).not.toBe("");
  }).toPass({ timeout: 20_000 });
  await page.locator("#signin-code").fill(code);
  await page.getByRole("button", { name: "Inloggen met code" }).click();
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
    await expect(page).toHaveURL(/\/app$/, { timeout: 60_000 });
    await expect(shell).toBeVisible({ timeout: 60_000 });
  }
  await expect(page).toHaveURL(/\/app$/);
  await skipTour(page);
}

/**
 * The guided tour opens once per account shortly after the first sign-in.
 * Tests skip it (which marks it as seen) so it never covers what they click.
 */
export async function skipTour(page: Page) {
  const skip = page.getByRole("dialog").getByRole("button", { name: /^(Overslaan|Skip)$/ }).first();
  await skip.waitFor({ state: "visible", timeout: 2_500 }).then(
    () => skip.click(),
    () => undefined,
  );
}

export async function acceptTerms(page: Page) {
  await page.getByLabel(/Ik ga akkoord/).check();
  await page.getByRole("button", { name: "Doorgaan" }).click();
}

/** Today's date in the Netherlands as YYYY-MM-DD. */
export function todayNl() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
}
