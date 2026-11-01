import { type APIRequestContext, type Browser, expect, type Page } from "@playwright/test";
import { test } from "./fixtures";
import { ADMIN_EMAIL, passwordFor, settleOnDashboard } from "./helpers";

/**
 * Account onboarding and email-code sign-in, through the real emails in
 * Mailpit: accounts the platform admin creates get a one-time link to choose
 * a password, and the code step of email sign-in starts empty.
 */

const MAILPIT = "http://localhost:8025/api/v1";
const run = Date.now().toString(36);
const PASSWORD = "Onboard-e2e-2026";
const SIX_DIGITS = /\b(\d{6})\b/;

/** Ids of the mails to `to` so far; mails arrive through the worker's queue, so new ones are told apart by id. */
async function mailIds(request: APIRequestContext, to: string): Promise<Set<string>> {
  const search = await (await request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:${to}`)}`)).json();
  return new Set((search.messages ?? []).map((m: { ID: string }) => m.ID));
}

/** The first match of `pattern` in a mail to `to` that isn't in `seen`. */
async function fromMail(request: APIRequestContext, to: string, pattern: RegExp, seen: Set<string>) {
  let found = "";
  await expect(async () => {
    const search = await (await request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:${to}`)}`)).json();
    for (const m of search.messages ?? []) {
      if (seen.has(m.ID)) continue;
      const text = (await (await request.get(`${MAILPIT}/message/${m.ID}`)).json()).Text as string;
      const hit = text.match(pattern);
      if (hit) {
        found = hit[1] ?? hit[0];
        break;
      }
    }
    expect(found).not.toBe("");
  }).toPass({ timeout: 20_000 });
  return found;
}

/** Requests a sign-in code; the code step must start empty, whatever was typed as the address. */
async function requestCode(page: Page, email: string) {
  await page.goto("/nl/sign-in");
  await page.getByRole("tab", { name: "Code per e-mail" }).click();
  await page.locator("#signin-code-email").fill(email);
  await page.getByRole("button", { name: "Mail me een code" }).click();
  await expect(page.getByText(`Als er een account bestaat voor ${email}`)).toBeVisible();
  await expect(page.locator("#signin-code")).toHaveValue("");
}

async function signInWithCode(page: Page, request: APIRequestContext, email: string) {
  const seen = await mailIds(request, email);
  await requestCode(page, email);
  await page.locator("#signin-code").fill(await fromMail(request, email, SIX_DIGITS, seen));
  await page.getByRole("button", { name: "Inloggen met code" }).click();
}

async function freshPage(browser: Browser, locale: "nl-NL" | "en-US") {
  return (await browser.newContext({ locale })).newPage();
}

test("email-code sign-in: the code field starts empty, takes pasted codes, resends and signs in", async ({ page, request }) => {
  const email = "planning@feestband.local";
  const first = await mailIds(request, email);
  await requestCode(page, email);
  const code = page.locator("#signin-code");
  // The browser's code autofill target, not an email field.
  await expect(code).toHaveAttribute("autocomplete", "one-time-code");
  await expect(code).toHaveAttribute("inputmode", "numeric");

  await test.step("pasted codes keep their digits only", async () => {
    await code.fill("12 34-56");
    await expect(code).toHaveValue("123456");
  });

  await test.step("a wrong code says so and keeps the step", async () => {
    const real = await fromMail(request, email, SIX_DIGITS, first);
    await code.fill(real === "000000" ? "111111" : "000000");
    await page.getByRole("button", { name: "Inloggen met code" }).click();
    await expect(page.getByText("Die code klopt niet of is verlopen.")).toBeVisible();
  });

  await test.step("another address goes back with the address kept, and a new request starts empty again", async () => {
    await page.getByRole("button", { name: "Ander e-mailadres gebruiken" }).click();
    await expect(page.locator("#signin-code-email")).toHaveValue(email);
    await page.getByRole("button", { name: "Mail me een code" }).click();
    await expect(code).toHaveValue("");
  });

  await test.step("a resent code replaces the old one and signs in", async () => {
    // Wait for the two codes so far, so only the resent one is new.
    await expect.poll(async () => (await mailIds(request, email)).size, { timeout: 20_000 }).toBeGreaterThanOrEqual(first.size + 2);
    const before = await mailIds(request, email);
    await code.fill("99");
    await page.getByRole("button", { name: "Stuur een nieuwe code" }).click();
    await expect(code).toHaveValue("");
    await expect(page.getByRole("button", { name: "Stuur een nieuwe code" })).toBeEnabled();
    await code.fill(await fromMail(request, email, SIX_DIGITS, before));
    await page.getByRole("button", { name: "Inloggen met code" }).click();
    await settleOnDashboard(page);
  });
});

test("an account the admin creates gets a one-time link to choose its password", async ({ browser, request }) => {
  const admin = await freshPage(browser, "nl-NL");
  await signInWithCode(admin, request, ADMIN_EMAIL);
  await settleOnDashboard(admin);

  const owner = `owner.${run}@test.local`;
  let link = "";
  await test.step("the admin sets up an agency; the new owner's email links to the password setup", async () => {
    const seen = await mailIds(request, owner);
    await admin.goto("/nl/app/agencies");
    await admin.getByRole("button", { name: "Nieuw bureau" }).click();
    const dialog = admin.getByRole("dialog");
    await dialog.getByLabel("Naam van het bureau").fill(`E2E Onboarding ${run}`);
    await dialog.getByLabel("Naam eigenaar").fill("Onno Owner");
    await dialog.getByLabel("E-mailadres eigenaar").fill(owner);
    await dialog.getByRole("button", { name: "Bureau aanmaken" }).click();
    await expect(admin.getByText(`E2E Onboarding ${run} aangemaakt.`)).toBeVisible();
    // English is the dialog's default language: no /nl prefix.
    link = await fromMail(request, owner, /(https?:\/\/\S+\/reset-password\?token=\w+&setup=1)/, seen);
    expect(link).not.toContain("/nl/");
  });

  await test.step("a signed-in browser opening the link sees the setup form, not its own dashboard", async () => {
    const tab = await admin.context().newPage();
    await tab.goto(link);
    await expect(tab.getByRole("heading", { name: "Kies je wachtwoord" })).toBeVisible();
    await expect(tab.locator("#reset-password")).toBeVisible();
    await tab.close();
  });

  const visitor = await freshPage(browser, "en-US");
  await test.step("in a fresh browser the owner chooses a password (English route)", async () => {
    await visitor.goto(link);
    await expect(visitor).toHaveURL(/\/reset-password\?token=/);
    await expect(visitor.getByRole("heading", { name: "Choose your password" })).toBeVisible();
    await visitor.locator("#reset-password").fill(PASSWORD);
    await visitor.locator("#reset-confirm").fill(PASSWORD);
    await visitor.getByRole("button", { name: "Save password" }).click();
    await expect(visitor.getByText("Your password is set.")).toBeVisible();
  });

  await test.step("the owner signs in with the new password", async () => {
    await visitor.getByRole("link", { name: "Sign in" }).click();
    await visitor.locator("#signin-email").fill(owner);
    await visitor.locator("#signin-password").fill(PASSWORD);
    await visitor.getByRole("button", { name: "Sign in", exact: true }).click();
    // Using the emailed link confirmed the address: no "confirm your email first".
    await expect(visitor).toHaveURL(/\/(app|accept-terms)/, { timeout: 30_000 });
  });

  await test.step("the used link can't set a password again and offers a new one", async () => {
    const again = await freshPage(browser, "en-US");
    await again.goto(link);
    await expect(again.getByText("This link has expired or was already used.")).toBeVisible();
    await expect(again.locator("#reset-password")).toHaveCount(0);
    await again.getByRole("link", { name: "Request a new link" }).click();
    await expect(again).toHaveURL(/\/forgot-password$/);
  });

  await test.step("an unknown or expired token shows the same recovery (Dutch route)", async () => {
    const stranger = await freshPage(browser, "nl-NL");
    await stranger.goto("/nl/reset-password?token=0123456789abcdef0123456789abcdef&setup=1");
    await expect(stranger.getByText("Deze link is verlopen of al gebruikt.")).toBeVisible();
    await expect(stranger.getByRole("link", { name: "Vraag een nieuwe link aan" })).toBeVisible();
  });

  await test.step("a forgotten-password reset works for the new account too (Dutch route)", async () => {
    const seen = await mailIds(request, owner);
    const page = await freshPage(browser, "nl-NL");
    await page.goto("/nl/forgot-password");
    await page.locator("#forgot-email").fill(owner);
    await page.getByRole("button", { name: "Link versturen" }).click();
    await expect(page.getByText(`Als er een account is voor ${owner}`)).toBeVisible();
    const reset = await fromMail(request, owner, /(https?:\/\/\S+\/api\/auth\/reset-password\/\S+)/, seen);
    await page.goto(reset);
    await expect(page).toHaveURL(/\/nl\/reset-password\?token=/);
    await expect(page.getByRole("heading", { name: "Kies een nieuw wachtwoord" })).toBeVisible();
    await page.locator("#reset-password").fill(`${PASSWORD}-2`);
    await page.locator("#reset-confirm").fill(`${PASSWORD}-2`);
    await page.getByRole("button", { name: "Wachtwoord opslaan" }).click();
    await expect(page.getByText("Je wachtwoord is gewijzigd.")).toBeVisible();
  });
});

test("a new platform admin gets the account setup email", async ({ browser, request }) => {
  const admin = await freshPage(browser, "nl-NL");
  await signInWithCode(admin, request, ADMIN_EMAIL);
  await settleOnDashboard(admin);
  const email = `admin.${run}@test.local`;
  const seen = await mailIds(request, email);
  await admin.goto("/nl/app/users");
  await admin.getByRole("button", { name: "Beheerder toevoegen" }).click();
  const dialog = admin.getByRole("dialog");
  await dialog.getByLabel("Naam", { exact: true }).fill("Ada Admin");
  await dialog.getByLabel("E-mailadres", { exact: true }).fill(email);
  await dialog.getByRole("combobox").click();
  await admin.getByRole("option", { name: "Nederlands" }).click();
  await dialog.getByRole("button", { name: "Beheerder toevoegen", exact: true }).click();
  const link = await fromMail(request, email, /(https?:\/\/\S+\/nl\/reset-password\?token=\w+&setup=1)/, seen);
  const page = await freshPage(browser, "nl-NL");
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Kies je wachtwoord" })).toBeVisible();
});

test("a partner the admin adds chooses a password from the welcome email; with a password they're sent to sign in", async ({ browser, request }) => {
  const admin = await freshPage(browser, "nl-NL");
  await signInWithCode(admin, request, ADMIN_EMAIL);
  await settleOnDashboard(admin);
  const name = `Pia Partner ${run}`;
  const email = `partner.${run}@test.local`;

  const addPartner = async () => {
    const seen = await mailIds(request, email);
    await admin.goto("/nl/app/affiliates");
    await admin.getByRole("button", { name: "Partner toevoegen" }).click();
    const dialog = admin.getByRole("dialog");
    await dialog.getByLabel("Naam", { exact: true }).fill(name);
    await dialog.getByLabel("E-mailadres", { exact: true }).fill(email);
    await dialog.getByRole("combobox").click();
    await admin.getByRole("option", { name: "Nederlands" }).click();
    await dialog.getByRole("button", { name: "Partner toevoegen" }).click();
    await expect(admin.getByText("Partner toegevoegd.")).toBeVisible();
    return seen;
  };

  let link = "";
  await test.step("a new partner's welcome email links to the password setup (Dutch)", async () => {
    const seen = await addPartner();
    link = await fromMail(request, email, /(https?:\/\/\S+\/nl\/reset-password\?token=\w+&setup=1)/, seen);
  });

  const partner = await freshPage(browser, "nl-NL");
  await test.step("the partner chooses a password and signs in with it", async () => {
    await partner.goto(link);
    await expect(partner.getByRole("heading", { name: "Kies je wachtwoord" })).toBeVisible();
    await partner.locator("#reset-password").fill(PASSWORD);
    await partner.locator("#reset-confirm").fill(PASSWORD);
    await partner.getByRole("button", { name: "Wachtwoord opslaan" }).click();
    await expect(partner.getByText("Je wachtwoord is ingesteld.")).toBeVisible();
    await partner.getByRole("link", { name: "Inloggen" }).click();
    await partner.locator("#signin-email").fill(email);
    await partner.locator("#signin-password").fill(PASSWORD);
    await partner.getByRole("button", { name: "Inloggen", exact: true }).click();
    await expect(partner).toHaveURL(/\/nl\/(app|accept-terms)/, { timeout: 30_000 });
  });

  await test.step("the used link is refused", async () => {
    const again = await freshPage(browser, "nl-NL");
    await again.goto(link);
    await expect(again.getByText("Deze link is verlopen of al gebruikt.")).toBeVisible();
    await expect(again.locator("#reset-password")).toHaveCount(0);
  });

  await test.step("added again with a password, the email sends them to sign in instead", async () => {
    await admin.goto("/nl/app/affiliates?tab=partners");
    await admin.getByRole("button", { name: `Acties voor ${name}` }).click();
    await admin.getByRole("menuitem", { name: "Partner verwijderen" }).click();
    await admin.getByRole("dialog").getByRole("button", { name: "Partner verwijderen" }).click();
    await expect(admin.getByText("Partner verwijderd.")).toBeVisible();
    const seen = await addPartner();
    const url = await fromMail(request, email, /\[?(https?:\/\/\S+\/nl\/(?:sign-in|reset-password)\S*?)\]?(?:\s|$)/, seen);
    expect(url).toMatch(/\/nl\/sign-in$/);
  });
});

test("signing in never follows ?next= to another site", async ({ browser }) => {
  // Browsers drop the tab: "/\t/evil.example" would be "//evil.example".
  const page = await freshPage(browser, "en-US");
  const offSite: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame() && !frame.url().startsWith("http://localhost")) offSite.push(frame.url());
  });
  await page.route("http://evil.example/**", (route) => route.fulfill({ status: 200, body: "off-site" }));
  await page.goto("/sign-in?next=%2F%09%2Fevil.example%2Fx");
  await page.locator("#signin-email").fill("planning@feestband.local");
  await page.locator("#signin-password").fill(passwordFor("planning@feestband.local"));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/localhost:3000\/(app|accept-terms)/);
  expect(offSite).toEqual([]);
});
