import { expect, type Page, test } from "@playwright/test";
import { acceptTerms, settleOnDashboard, signIn, submitSignIn } from "./helpers";

/** Fills a new page in both languages in the page builder. */
async function fillPage(page: Page, slug: string, title: string, text: string) {
  await page.getByLabel("Adres (Nederlands)").fill(`${slug}-nl`);
  await page.getByLabel("Adres (Engels)").fill(`${slug}-en`);
  for (const [tab, suffix] of [["Nederlands", ""], ["English", " (EN)"]] as const) {
    await page.getByRole("tab", { name: tab }).click();
    await page.getByLabel("Titel", { exact: true }).fill(`${title}${suffix}`);
    await page.getByRole("button", { name: "Blok toevoegen" }).click();
    await page.getByRole("menuitem", { name: "Tekst", exact: true }).click();
    await page.getByLabel("Tekst", { exact: true }).last().fill(`${text}${suffix}`);
  }
}

/**
 * Phase 8: the super admin publishes a page that appears on the site and in
 * the footer; a reader's comment shows after approval; a newly published
 * legal page is put to users at their next sign-in.
 */
test("pages, comments and legal acceptance on the website", async ({ browser }) => {
  test.setTimeout(240_000);
  let footerPageUrl = "";
  const run = Date.now().toString(36);
  const admin = await (await browser.newContext()).newPage();
  const visitor = await (await browser.newContext()).newPage();
  await signIn(admin, "admin@stagedesk.local");

  await test.step("the admin publishes a page in the footer", async () => {
    await admin.goto("/app/pages/new");
    await fillPage(admin, `e2e-${run}`, `Werken bij ${run}`, "We zoeken nog een DJ-planner.");
    await admin.getByLabel("Getoond in").click();
    await admin.getByRole("option", { name: "Footer: Bedrijf" }).click();
    await admin.getByRole("button", { name: "Opslaan en publiceren" }).click();
    await expect(admin.getByText("Versie 1 staat live.")).toBeVisible();
    await expect(admin).toHaveURL(/\/app\/pages\/[0-9a-f-]{36}$/);
    footerPageUrl = admin.url();
  });

  await test.step("visitors see it, in both languages, linked from the footer", async () => {
    await visitor.goto("/");
    await visitor.getByRole("contentinfo").getByRole("link", { name: `Werken bij ${run}` }).click();
    await expect(visitor).toHaveURL(new RegExp(`/e2e-${run}-nl$`));
    await expect(visitor.getByText("We zoeken nog een DJ-planner.")).toBeVisible();
    await visitor.goto(`/en/e2e-${run}-en`);
    await expect(visitor.getByRole("heading", { name: `Werken bij ${run} (EN)` })).toBeVisible();
  });

  await test.step("a reader's comment appears after the admin approves it", async () => {
    // A fresh visitor: the previous one switched to English, which the site remembers.
    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto("/blog/offertes-die-worden-geaccepteerd");
    await visitor.getByLabel("Naam").fill(`Lezer ${run}`);
    await visitor.getByLabel("E-mailadres").fill(`lezer.${run}@test.local`);
    await visitor.getByLabel("Reactie", { exact: true }).fill(`Handige tips! ${run}`);
    await expect(visitor.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, { timeout: 30_000 });
    await visitor.getByRole("button", { name: "Reactie plaatsen" }).click();
    await expect(visitor.getByText("Bedankt! Je reactie verschijnt", { exact: false })).toBeVisible();
    await visitor.reload();
    await expect(visitor.getByText(`Handige tips! ${run}`)).toHaveCount(0);

    await admin.goto("/app/pages?tab=comments");
    await admin.locator("div").filter({ hasText: `Handige tips! ${run}` }).getByRole("button", { name: "Goedkeuren" }).last().click();
    await expect(admin.getByText("Reactie gepubliceerd.")).toBeVisible();
    await visitor.reload();
    await expect(visitor.getByText(`Handige tips! ${run}`)).toBeVisible();
  });

  await test.step("a new legal page is put to an agency owner at the next sign-in", async () => {
    await admin.goto("/app/pages/new");
    await fillPage(admin, `e2e-regels-${run}`, `Huisregels ${run}`, "Wees aardig voor elkaar.");
    await admin.getByLabel("Juridische pagina").click();
    await admin.getByLabel("Nieuwe versies laten accepteren").click();
    await admin.getByRole("option", { name: "Iedereen" }).click();
    await admin.getByRole("button", { name: "Opslaan en publiceren" }).click();
    await expect(admin.getByText("Versie 1 staat live.")).toBeVisible();
    await expect(admin).toHaveURL(/\/app\/pages\/[0-9a-f-]{36}$/);
    const editUrl = admin.url();

    const owner = await (await browser.newContext()).newPage();
    await submitSignIn(owner, "eigenaar@feestband.local");
    await expect(owner).toHaveURL(/\/accept-terms$/);
    await expect(owner.getByText(`Huisregels ${run}`)).toBeVisible();
    await expect(owner.getByRole("button", { name: "Doorgaan" })).toBeDisabled();
    await acceptTerms(owner);
    await expect(owner).toHaveURL(/\/app$/);

    // Clean up: the admin is asked too; then the test page goes offline so nobody else is.
    await admin.goto("/app");
    await settleOnDashboard(admin);
    await admin.goto(editUrl);
    await admin.getByRole("button", { name: "Offline halen" }).click();
    await expect(admin.getByText("Pagina offline gehaald.")).toBeVisible();
    await admin.goto(footerPageUrl);
    await admin.getByRole("button", { name: "Offline halen" }).click();
    await expect(admin.getByText("Pagina offline gehaald.")).toBeVisible();
  });
});
