import { expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";

export const DEMO_PASSWORD = "StageDesk-demo-2026";
const MAILPIT = "http://localhost:8025/api/v1";

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

/** Closes pages created from the worker-scoped browser, including on failure. */
export async function closeBrowserContexts(browser: Browser) {
  await Promise.all(browser.contexts().map((context) => context.close()));
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
    }).toPass({ timeout: 60_000 });
    if (!(await limited.isVisible())) return;
    await page.waitForTimeout(61_000);
  }
  throw new Error("Sign-in still rate limited after waiting a minute");
}

/** The code tab of the sign-in page, with the newest code Mailpit received for `email`. */
async function signInWithMailedCode(page: Page, email: string) {
  const ids = async () => {
    const search = await (await page.request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
    return (search.messages ?? []) as { ID: string }[];
  };
  const seen = new Set((await ids()).map((m) => m.ID));
  await openCodeTab(page);
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
 * The code tab of the sign-in page. A click before the page has hydrated does nothing, and the
 * field behind the tab then never appears, so this tries again until the tab has really opened.
 */
export async function openCodeTab(page: Page) {
  await expect(async () => {
    await page.getByRole("tab", { name: "Code per e-mail" }).click();
    await expect(page.locator("#signin-code-email")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

/**
 * A new independent artist, from sign-up to their own account. The confirmation link may or may not
 * leave them signed in, so this waits for whichever page comes up. (`isVisible` can't do that: it
 * ignores its timeout and answers at once, also while the page is still loading.)
 */
export async function signUpSoloArtist(page: Page, request: APIRequestContext, { name, email, stage }: { name: string; email: string; stage: string }) {
  await page.goto(`/nl/sign-up?next=${encodeURIComponent("/onboarding?start=artist")}`);
  await page.locator("#signup-name").fill(name);
  await page.locator("#signup-email").fill(email);
  await page.locator("#signup-password").fill(DEMO_PASSWORD);
  await page.locator("#signup-confirm").fill(DEMO_PASSWORD);
  await page.locator('form button[type="submit"]').click();
  let link = "";
  await expect(async () => {
    const search = await (await request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
    for (const m of search.messages ?? []) {
      const hit = ((await (await request.get(`${MAILPIT}/message/${m.ID}`)).json()).Text as string).match(/https?:\/\/\S*verify-email\S+/);
      if (hit) link = hit[0];
    }
    expect(link).not.toBe("");
  }).toPass({ timeout: 20_000 });
  await page.goto(link);

  await page.goto("/nl/onboarding?start=artist");
  const form = page.locator("#solo-name");
  const signInField = page.locator("#signin-email");
  await expect(form.or(signInField)).toBeVisible({ timeout: 60_000 });
  if (await signInField.isVisible()) {
    await signInField.fill(email);
    await page.locator("#signin-password").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Inloggen", exact: true }).click();
    await expect(form).toBeVisible({ timeout: 60_000 });
  }
  await form.fill(stage);
  await page.locator("#solo-city").fill("Utrecht");
  await page.locator("#solo-genres").fill("House, Disco");
  await page.getByRole("button", { name: "Mijn artiestenaccount maken" }).click();
  await expect(page).toHaveURL(/\/app/, { timeout: 60_000 });
}

/**
 * Into the app for someone who just made their account: past the Terms if they're put to them.
 * A new account can land elsewhere than /app afterwards (billing, for instance), so this waits for the app itself.
 */
export async function enterAppAsNewAccount(page: Page) {
  await page.goto("/nl/app");
  const gate = page.getByLabel(/Ik ga akkoord/);
  const shell = page.locator('[data-slot="sidebar"]').first();
  await expect(gate.or(shell)).toBeVisible({ timeout: 30_000 });
  if (await gate.isVisible()) {
    await acceptTerms(page);
    await expect(shell).toBeVisible({ timeout: 60_000 });
  }
  await skipTour(page);
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
