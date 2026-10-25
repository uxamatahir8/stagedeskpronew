import { expect, type APIRequestContext, test } from "@playwright/test";
import { acceptTerms, DEMO_PASSWORD, signIn } from "./helpers";

const MAILPIT = "http://localhost:8025";

/** The confirmation link from the newest email to `to` (Mailpit). */
async function verifyLink(request: APIRequestContext, to: string) {
  let link = "";
  await expect(async () => {
    const search = await (await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)).json();
    const id = search.messages?.[0]?.ID;
    expect(id).toBeTruthy();
    const message = await (await request.get(`${MAILPIT}/api/v1/message/${id}`)).json();
    link = message.Text.match(/https?:\/\/\S*verify-email\S*/)?.[0] ?? "";
    expect(link).not.toBe("");
  }).toPass({ timeout: 20_000 });
  return link;
}

/**
 * Phase 6: someone applies as a partner, the platform admin approves them,
 * and an agency that arrives through the partner's campaign link is credited
 * to that partner.
 */
test("a partner applies, is approved, and gets credit for an agency from their link", async ({ browser }) => {
  const run = Date.now().toString(36);
  const partnerEmail = `partner.${run}@e2e-partners.nl`;
  const agencyEmail = `bureau.${run}@e2e-bureau.nl`;
  const code = `e2e${run}`.slice(0, 24);
  const partner = await (await browser.newContext()).newPage();
  const admin = await (await browser.newContext()).newPage();
  const agency = await (await browser.newContext()).newPage();

  await test.step("a visitor applies on the partner page and confirms their email", async () => {
    await partner.goto("/nl/partners");
    await partner.getByLabel("Je naam").fill(`Eva E2E ${run}`);
    await partner.getByLabel("E-mailadres").fill(partnerEmail);
    await partner.getByLabel("Wachtwoord", { exact: true }).fill(DEMO_PASSWORD);
    await partner.getByLabel("Herhaal wachtwoord", { exact: true }).fill(DEMO_PASSWORD);
    await partner.getByLabel("Wie bereik je, en hoe?").fill("Ik organiseer bedrijfsfeesten en werk met tien DJ-bureaus.");
    await partner.getByLabel("Naam in je link (optioneel)").fill(code);
    await expect(partner.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 30_000 });
    await partner.getByRole("button", { name: "Aanmelding versturen" }).click();
    await expect(partner.getByText("Aanmelding ontvangen")).toBeVisible();

    // Confirming signs them in; they accept the Terms, then land on the dashboard.
    await partner.goto(await verifyLink(partner.request, partnerEmail));
    await expect(partner).toHaveURL(/\/accept-terms$/);
    await acceptTerms(partner);
    await expect(partner).toHaveURL(/\/app$/);
    await expect(partner.getByText("We bekijken hem nu.", { exact: false })).toBeVisible();
  });

  await test.step("the platform admin approves the application", async () => {
    await signIn(admin, "admin@stagedesk.local");
    await admin.goto("/nl/app/affiliates?tab=partners");
    const application = admin.locator("div").filter({ hasText: partnerEmail }).filter({ has: admin.getByRole("button", { name: "Goedkeuren" }) }).last();
    await application.getByRole("button", { name: "Goedkeuren" }).click();
    await expect(admin.getByText("Partner goedgekeurd.")).toBeVisible();
  });

  await test.step("the partner sees their link and code", async () => {
    await partner.goto("/nl/app/links");
    await expect(partner.getByLabel("Je link").first()).toHaveValue(new RegExp(`via=${code}`));
    await partner.getByLabel("Campagne").fill("e2e");
    await expect(partner.getByLabel("Je link").first()).toHaveValue(new RegExp(`via=${code}&c=e2e`));
  });

  await test.step("an agency arrives through the campaign link, signs up and creates its agency", async () => {
    await agency.goto(`/nl/?via=${code}&c=e2e`);
    await agency.goto("/nl/sign-up");
    await agency.getByLabel("Je naam").fill(`Bas Bureau ${run}`);
    await agency.getByLabel("E-mailadres").fill(agencyEmail);
    await agency.getByLabel("Wachtwoord", { exact: true }).fill(DEMO_PASSWORD);
    await agency.getByLabel("Herhaal wachtwoord", { exact: true }).fill(DEMO_PASSWORD);
    await agency.getByRole("button", { name: "Account aanmaken" }).click();
    // Confirming signs them in; without an agency yet they land on agency setup.
    await agency.goto(await verifyLink(agency.request, agencyEmail));
    await expect(agency).toHaveURL(/\/onboarding\?start=agency$/);

    // A wrong partner code is refused; empty is fine because the link already counts.
    await agency.getByLabel("Naam van het bureau").fill(`E2E Bureau ${run}`);
    await agency.getByLabel("Partnercode (optioneel)").fill("BESTAATNIET");
    await agency.getByRole("button", { name: "Bureau aanmaken" }).click();
    await expect(agency.getByText("We kennen deze partnercode niet.", { exact: false })).toBeVisible();
    await agency.getByLabel("Naam van het bureau").fill(`E2E Bureau ${run}`);
    await agency.getByLabel("Partnercode (optioneel)").fill("");
    await agency.getByRole("button", { name: "Bureau aanmaken" }).click();
    // Agency members accept the Terms and the data processing agreement.
    await expect(agency).toHaveURL(/\/accept-terms$/);
    await expect(agency.getByText("Verwerkersovereenkomst")).toBeVisible();
    await acceptTerms(agency);
    // No automatic trial: a new agency chooses its plan first.
    await expect(agency).toHaveURL(/\/app\/billing\?welcome=1$/);
  });

  await test.step("the partner's funnel shows the click and the signup for the campaign", async () => {
    await partner.goto("/nl/app");
    const row = partner.getByRole("row").filter({ hasText: "e2e" });
    await expect(row.getByRole("cell").nth(1)).toHaveText("1");
    await expect(row.getByRole("cell").nth(2)).toHaveText("1");
  });
});
