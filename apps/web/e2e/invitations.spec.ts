import { type APIRequestContext, expect, test } from "@playwright/test";
import { settleOnDashboard, signIn } from "./helpers";

/**
 * Team invitations through the real emails in Mailpit: a new person signs up
 * from the link, confirms their address and joins; an existing account signs
 * in and joins; a used link offers a way on. Feestband has well over 100
 * members (its customers), which Better Auth's default membership cap refused.
 */

const MAILPIT = "http://localhost:8025/api/v1";
const run = Date.now().toString(36);
const invitee = `invitee.${run}@test.local`;
const PASSWORD = "Invitee-e2e-2026";

async function mailIds(request: APIRequestContext, to: string): Promise<Set<string>> {
  const search = await (await request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:${to}`)}`)).json();
  return new Set((search.messages ?? []).map((m: { ID: string }) => m.ID));
}

async function fromMail(request: APIRequestContext, to: string, pattern: RegExp, seen: Set<string>) {
  let found = "";
  await expect(async () => {
    const search = await (await request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:${to}`)}`)).json();
    for (const m of search.messages ?? []) {
      if (seen.has(m.ID)) continue;
      const hit = ((await (await request.get(`${MAILPIT}/message/${m.ID}`)).json()).Text as string).match(pattern);
      if (hit) {
        found = hit[1] ?? hit[0];
        break;
      }
    }
    expect(found).not.toBe("");
  }).toPass({ timeout: 20_000 });
  return found;
}

const INVITE_LINK = /(https?:\/\/\S+\/invite\/[\w-]+)/;

test("an invited person signs up from the link, joins, and the link can't be used again", async ({ browser, request }) => {
  test.setTimeout(240_000);
  const owner = await (await browser.newContext()).newPage();
  await signIn(owner, "eigenaar@feestband.local");

  let link = "";
  await test.step("the owner invites a new address; a refused invite keeps what was typed", async () => {
    const seen = await mailIds(request, invitee);
    await owner.goto("/nl/app/team");
    await owner.getByRole("button", { name: "Lid uitnodigen" }).click();
    const dialog = owner.getByRole("dialog");
    // A member already: refused, and the address stays in the field.
    await dialog.locator("#invite-email").fill("eigenaar@feestband.local");
    await dialog.getByRole("button", { name: "Uitnodiging versturen" }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Uitnodiging versturen" })).toBeEnabled();
    await expect(dialog.locator("#invite-email")).toHaveValue("eigenaar@feestband.local");
    await dialog.locator("#invite-email").fill(invitee);
    await dialog.getByRole("button", { name: "Uitnodiging versturen" }).click();
    await expect(owner.getByText(`Uitnodiging verstuurd naar ${invitee}.`)).toBeVisible();
    link = await fromMail(request, invitee, INVITE_LINK, seen);
  });

  await test.step("someone signed in with another account is told so", async () => {
    const tab = await owner.context().newPage();
    await tab.goto(link);
    await expect(tab.getByText(`Je bent ingelogd als eigenaar@feestband.local, maar deze uitnodiging is voor ${invitee}.`)).toBeVisible();
    await tab.close();
  });

  const guest = await (await browser.newContext()).newPage();
  await test.step("the invitee creates an account from the link and confirms their address", async () => {
    await guest.goto(link);
    await guest.getByRole("link", { name: "Account aanmaken" }).first().click();
    await expect(guest.locator("#signup-email")).toHaveValue(invitee);
    await expect(guest.getByText("Je maakt een account aan om lid te worden van Feestband Utrecht.")).toBeVisible();
    const seen = await mailIds(request, invitee);
    await guest.locator("#signup-name").fill("Ivo Invitee");
    await guest.locator("#signup-password").fill(PASSWORD);
    await guest.locator("#signup-confirm").fill(PASSWORD);
    await guest.getByRole("button", { name: "Account aanmaken" }).click();
    await expect(guest.getByText("Check je inbox")).toBeVisible();
    await guest.goto(await fromMail(request, invitee, /(https?:\/\/\S+\/api\/auth\/verify-email\S+)/, seen));
    // Signed in and back on the invitation.
    await expect(guest).toHaveURL(/\/invite\//);
  });

  await test.step("accepting joins the agency", async () => {
    await guest.getByRole("button", { name: "Uitnodiging accepteren" }).click();
    await settleOnDashboard(guest);
  });

  await test.step("the used link says so and offers sign-in", async () => {
    const again = await (await browser.newContext()).newPage();
    await again.goto(link);
    await expect(again.getByRole("heading", { name: "Deze uitnodiging is niet meer geldig" })).toBeVisible();
    await expect(again.getByRole("link", { name: "Inloggen" }).last()).toBeVisible();
  });

  await test.step("an existing account invited by another agency signs in from the link and joins", async () => {
    const other = await (await browser.newContext()).newPage();
    await signIn(other, "eigenaar@rotterdamdj.local");
    const seen = await mailIds(request, invitee);
    await other.goto("/nl/app/team");
    await other.getByRole("button", { name: "Lid uitnodigen" }).click();
    await other.getByRole("dialog").locator("#invite-email").fill(invitee);
    await other.getByRole("dialog").getByRole("button", { name: "Uitnodiging versturen" }).click();
    await expect(other.getByText(`Uitnodiging verstuurd naar ${invitee}.`)).toBeVisible();
    const second = await fromMail(request, invitee, INVITE_LINK, seen);

    const fresh = await (await browser.newContext()).newPage();
    await fresh.goto(second);
    await fresh.getByRole("link", { name: "Inloggen" }).last().click();
    await expect(fresh).toHaveURL(/\/sign-in\?next=%2Finvite%2F/);
    await fresh.locator("#signin-email").fill(invitee);
    await fresh.locator("#signin-password").fill(PASSWORD);
    await fresh.getByRole("button", { name: "Inloggen", exact: true }).click();
    // Back on the invitation, not the dashboard.
    await expect(fresh).toHaveURL(/\/invite\//);
    await fresh.getByRole("button", { name: "Uitnodiging accepteren" }).click();
    await expect(fresh).toHaveURL(/\/(app|accept-terms)/);
  });
});

test("a wrong current password keeps the change-password fields", async ({ page }) => {
  await signIn(page, "planning@feestband.local");
  await page.goto("/nl/app/profile");
  await page.locator("#profile-current-password").fill("Not-the-password-1");
  await page.locator("#profile-new-password").fill("Another-pass-2026");
  await page.locator("#profile-confirm-password").fill("Another-pass-2026");
  await page.getByRole("button", { name: "Wachtwoord wijzigen" }).click();
  await expect(page.getByText("Je huidige wachtwoord klopt niet.")).toBeVisible();
  await expect(page.locator("#profile-current-password")).toHaveValue("Not-the-password-1");
  await expect(page.locator("#profile-new-password")).toHaveValue("Another-pass-2026");
});
