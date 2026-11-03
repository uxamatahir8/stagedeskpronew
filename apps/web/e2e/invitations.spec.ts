import { type APIRequestContext, expect, test } from "@playwright/test";
import { ADMIN_EMAIL, settleOnDashboard, signIn } from "./helpers";

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

test("staff seats hold for role changes, also through Better Auth's API directly", async ({ browser, request }) => {
  test.setTimeout(240_000);
  const owner = `seats.${run}@test.local`;
  const artist = `seats-artist.${run}@test.local`;
  const agencyName = `E2E Seats ${run}`;
  const PASS = "Seats-e2e-2026";

  const admin = await (await browser.newContext({ locale: "nl-NL" })).newPage();
  await signIn(admin, ADMIN_EMAIL);
  let organizationId = "";
  let setupLink = "";
  await test.step("the admin sets up an agency on Starter (2 team seats)", async () => {
    const seen = await mailIds(request, owner);
    await admin.goto("/nl/app/agencies");
    await admin.getByRole("button", { name: "Nieuw bureau" }).click();
    const dialog = admin.getByRole("dialog");
    await dialog.getByLabel("Naam van het bureau").fill(agencyName);
    await dialog.getByLabel("Naam eigenaar").fill("Sem Seats");
    await dialog.getByLabel("E-mailadres eigenaar").fill(owner);
    await dialog.locator("#na-locale").click();
    await admin.getByRole("option", { name: "Nederlands" }).click();
    await dialog.getByRole("button", { name: "Bureau aanmaken" }).click();
    // Creation navigates to the durable agency page; the toast may disappear while
    // a development server is compiling that page for the first time.
    await expect(admin.getByRole("heading", { level: 1, name: agencyName })).toBeVisible({ timeout: 60_000 });
    setupLink = await fromMail(request, owner, /(https?:\/\/\S+\/nl\/reset-password\?token=\w+&setup=1)/, seen);
    await expect(admin).toHaveURL(/\/app\/agencies\/[\w-]+$/);
    organizationId = admin.url().split("/").pop()!;
    await admin.locator("#sub-plan").click();
    await admin.getByRole("option", { name: "Starter" }).click();
    await admin.getByRole("button", { name: "Toekennen" }).click();
    await expect(admin.getByText("Abonnement toegekend.")).toBeVisible();
  });

  const page = await (await browser.newContext({ locale: "nl-NL" })).newPage();
  await test.step("the owner chooses a password, adds an artist and invites one staff member (seat 2 of 2)", async () => {
    await page.goto(setupLink);
    await page.locator("#reset-password").fill(PASS);
    await page.locator("#reset-confirm").fill(PASS);
    await page.getByRole("button", { name: "Wachtwoord opslaan" }).click();
    await expect(page.getByText("Je wachtwoord is ingesteld.", { exact: false })).toBeVisible();
    await page.goto("/nl/sign-in");
    await page.locator("#signin-email").fill(owner);
    await page.locator("#signin-password").fill(PASS);
    await page.getByRole("button", { name: "Inloggen", exact: true }).click();
    await settleOnDashboard(page);

    await page.goto("/nl/app/artists");
    await page.getByRole("button", { name: "Artiest toevoegen" }).click();
    await page.locator("#ar-name").fill("DJ Seat");
    await page.locator("#ar-email").fill(artist);
    await page.getByRole("dialog").getByRole("button", { name: "Opslaan" }).click();
    await expect(page.getByText(`DJ Seat is toegevoegd.`, { exact: false })).toBeVisible();

    await page.goto("/nl/app/team");
    await page.getByRole("button", { name: "Lid uitnodigen" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#invite-email").fill(`seats-staff.${run}@test.local`);
    await dialog.locator("#invite-role").click();
    await page.getByRole("option", { name: "Medewerker bureau" }).click();
    await dialog.getByRole("button", { name: "Uitnodiging versturen" }).click();
    await expect(page.getByText(`Uitnodiging verstuurd naar seats-staff.${run}@test.local.`)).toBeVisible();
  });

  await test.step("a direct Better Auth request can't make the artist staff", async () => {
    const list = await (await page.request.get(`/api/auth/organization/list-members?organizationId=${organizationId}`)).json();
    const memberId = (list.members as { id: string; user: { email: string } }[]).find((m) => m.user.email === artist)!.id;
    const response = await page.request.post("/api/auth/organization/update-member-role", {
      headers: { origin: "http://localhost:3000" },
      data: { memberId, role: "agency_staff", organizationId },
    });
    expect(response.status()).toBe(403);
    expect((await response.json()).code).toBe("STAFF_SEATS_FULL");
    const after = await (await page.request.get(`/api/auth/organization/list-members?organizationId=${organizationId}`)).json();
    expect((after.members as { role: string; user: { email: string } }[]).find((m) => m.user.email === artist)!.role).toBe("artist");
  });

  const artistRow = page.getByRole("row").filter({ hasText: artist });
  await test.step("the team page says so in Dutch and keeps the role", async () => {
    await page.reload();
    await artistRow.getByRole("combobox", { name: "Rol" }).click();
    await page.getByRole("option", { name: "Beheerder bureau" }).click();
    await expect(page.getByText("Je abonnement staat 2 toe voor ‘Teamplaatsen’.", { exact: false })).toBeVisible();
    await page.reload();
    await expect(artistRow.getByRole("combobox", { name: "Rol" })).toHaveText("Artiest");
  });

  await test.step("withdrawing the invitation frees the seat; demoting frees it again", async () => {
    await page.getByRole("row").filter({ hasText: `seats-staff.${run}@test.local` }).getByRole("button", { name: "Intrekken" }).click();
    await expect(page.getByText("Uitnodiging ingetrokken.")).toBeVisible();
    await artistRow.getByRole("combobox", { name: "Rol" }).click();
    await page.getByRole("option", { name: "Medewerker bureau" }).click();
    await expect(page.getByText("Rol bijgewerkt.")).toBeVisible();
    // Wait for the list to show the new role, or picking "Artiest" again changes nothing.
    await expect(artistRow.getByRole("combobox", { name: "Rol" })).toHaveText("Medewerker bureau");
    await artistRow.getByRole("combobox", { name: "Rol" }).click();
    await page.getByRole("option", { name: "Artiest" }).click();
    await expect(artistRow.getByRole("combobox", { name: "Rol" })).toHaveText("Artiest");
    await page.reload();
    await expect(artistRow.getByRole("combobox", { name: "Rol" })).toHaveText("Artiest");
  });
});
