import { expect, test } from "@playwright/test";
import { ADMIN_EMAIL, closeBrowserContexts, DEMO_PASSWORD, signIn, todayNl } from "./helpers";

/** What the QA round of November 2026 found, as a person meets it on screen. */
test.afterEach(async ({ browser }) => closeBrowserContexts(browser));

const MAILPIT = "http://localhost:8025/api/v1";
const run = Date.now().toString(36);
const days = (n: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date(Date.now() + n * 86_400_000));

test("a form keeps what was typed when a field is refused", async ({ page, request }) => {
  const email = `keep.${run}@test.local`;
  await page.goto("/nl/sign-up");
  await page.locator("#signup-name").fill("Keep Values");
  await page.locator("#signup-email").fill(email);
  await page.locator("#signup-password").fill(DEMO_PASSWORD);
  await page.locator("#signup-confirm").fill(DEMO_PASSWORD);
  await page.locator('form button[type="submit"]').click();
  let link = "";
  await expect(async () => {
    const search = await (await request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
    for (const m of search.messages ?? []) link = ((await (await request.get(`${MAILPIT}/message/${m.ID}`)).json()).Text as string).match(/https?:\/\/\S*verify-email\S+/)?.[0] ?? link;
    expect(link).not.toBe("");
  }).toPass({ timeout: 20_000 });
  await page.goto(link);
  await page.goto("/nl/onboarding?start=agency");
  await page.locator("#onb-name").fill(`Bewaard ${run}`);
  await page.locator("#onb-city").fill("Utrecht");
  await page.locator("#onb-kvk").fill("123");
  await page.getByRole("button", { name: "Bureau aanmaken" }).click();
  await expect(page.getByText("Een KvK-nummer heeft 8 cijfers.")).toBeVisible();
  await expect(page.locator("#onb-name")).toHaveValue(`Bewaard ${run}`);
  await expect(page.locator("#onb-city")).toHaveValue("Utrecht");
});

test("a form sent before the page has loaded never puts its fields in the address", async ({ browser }) => {
  // The app's scripts never arrive, so the page shows but stays un-hydrated, like a slow phone in the first seconds.
  const page = await (await browser.newContext()).newPage();
  await page.route("**/_next/static/**/*.js*", (route) => route.abort());
  await page.goto("/nl/sign-up");
  await page.locator("#signup-name").fill("Niet Geladen");
  await page.locator("#signup-email").fill(`noscript.${run}@test.local`);
  await page.locator("#signup-password").fill(DEMO_PASSWORD);
  await page.locator("#signup-confirm").fill(DEMO_PASSWORD);
  await page.locator('form button[type="submit"]').click();
  await page.waitForTimeout(1_000);
  expect(page.url()).not.toContain("password");
  expect(page.url()).not.toContain(encodeURIComponent(DEMO_PASSWORD));
});

test("the pricing page's choice carries through sign-up", async ({ page }) => {
  await page.goto("/nl/pricing");
  await page.getByRole("radio", { name: /Per jaar|Yearly/ }).click();
  const href = await page.locator('main a[href*="interval%3Dyear"]').nth(1).getAttribute("href");
  expect(decodeURIComponent(href ?? "")).toMatch(/\/onboarding\?start=agency&plan=[\w-]+&interval=year/);
});

test.describe.serial("quotes, payments and dates at the agency", () => {
  let code = "";

  test("past dates are refused for staff too; a quote can't go below zero", async ({ page }) => {
    await signIn(page, "eigenaar@feestband.local");
    await page.goto("/nl/app/bookings/new");
    await page.getByRole("tab", { name: "Nieuwe klant" }).click();
    await page.getByLabel("Naam van de klant").fill(`QA Regressie ${run}`);
    await page.getByLabel("E-mailadres").fill(`qa.regressie.${run}@test.local`);
    await page.getByLabel("Datum").fill("2020-01-01");
    await page.getByLabel("Naam locatie").fill("Tivoli");
    await page.getByRole("button", { name: "Boeking aanmaken" }).click();
    await expect(page.getByText("Deze datum is al geweest.", { exact: false })).toBeVisible({ timeout: 30_000 });
    // And nothing typed was lost.
    await expect(page.getByLabel("Naam locatie")).toHaveValue("Tivoli");

    await page.getByLabel("Datum").fill(todayNl());
    await page.getByRole("button", { name: "Boeking aanmaken" }).click();
    await expect(page).toHaveURL(/\/app\/bookings\/[A-Z2-9]{8}$/, { timeout: 30_000 });
    code = page.url().split("/").pop()!;

    await page.getByRole("button", { name: "Offerte maken" }).click();
    await page.getByLabel("Omschrijving 1").fill("Korting");
    await page.getByLabel("Prijs excl. btw 1").fill("-5");
    await expect(page.getByText("Het totaal kan niet onder nul zijn.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Offerte versturen" })).toBeDisabled();

    await page.getByLabel("Prijs excl. btw 1").fill("100");
    await page.locator("#q-deposit").fill("150");
    await expect(page.getByText("Vul een percentage in van 0 tot 100.")).toBeVisible();
    await page.locator("#q-deposit").fill("30");
    await page.getByRole("button", { name: "Offerte versturen" }).click();
    await expect(page.getByText("Offerte versie 1 verstuurd.")).toBeVisible();
  });

  test("a payment above what's due asks for confirmation", async ({ page }) => {
    await signIn(page, "eigenaar@feestband.local");
    await page.goto(`/nl/app/bookings/${code}`);
    await page.getByRole("button", { name: "Namens klant accepteren" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Offerte accepteren" }).click();
    await expect(page.getByRole("button", { name: "Betaling vastleggen" })).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Betaling vastleggen" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Bedrag (€)").fill("99999");
    await dialog.getByRole("button", { name: "Betaling vastleggen" }).click();
    // It says how much is still due (SD-13 of the client report).
    await expect(dialog.getByText("Dit is meer dan er nog openstaat (€", { exact: false })).toBeVisible();
    await expect(dialog.getByLabel("Bedrag (€)")).toHaveValue("99999");
    // Corrected to what's due: no second question.
    await dialog.getByLabel("Bedrag (€)").fill("121");
    await dialog.getByRole("button", { name: "Betaling vastleggen" }).click();
    await expect(page.getByText("Betaling vastgelegd.")).toBeVisible();
  });

  test("a refund on an invoiced booking gets a credit note that downloads", async ({ page }) => {
    await signIn(page, "eigenaar@feestband.local");
    await page.goto(`/nl/app/bookings/${code}`);
    await page.getByRole("button", { name: "Factuur maken" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Factuur uitgeven" }).click();
    await expect(page.getByText(/Factuur .+ aangemaakt\./)).toBeVisible();
    await page.getByRole("button", { name: "Terugbetalen" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Bedrag").fill("12,10");
    await dialog.getByRole("button", { name: "Terugbetalen" }).click();
    const link = page.getByRole("link", { name: /Creditnota CN-\d{4}-\d{4}/ });
    await expect(link).toBeVisible({ timeout: 30_000 });
    const pdf = await page.request.get((await link.getAttribute("href"))!);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
  });
});

test("a suspended agency's quote can't be accepted", async ({ browser, request }) => {
  const owner = await (await browser.newContext()).newPage();
  const admin = await (await browser.newContext()).newPage();
  const customer = await (await browser.newContext()).newPage();
  const email = `qa.geschorst.${run}@test.local`;
  await signIn(owner, "eigenaar@rotterdamdj.local");
  await owner.goto("/nl/app/bookings/new");
  await owner.getByRole("tab", { name: "Nieuwe klant" }).click();
  await owner.getByLabel("Naam van de klant").fill(`QA Geschorst ${run}`);
  await owner.getByLabel("E-mailadres").fill(email);
  await owner.getByLabel("Datum").fill(days(60));
  await owner.getByRole("button", { name: "Boeking aanmaken" }).click();
  await expect(owner).toHaveURL(/\/app\/bookings\/[A-Z2-9]{8}$/, { timeout: 30_000 });
  await owner.getByRole("button", { name: "Offerte maken" }).click();
  await owner.getByLabel("Omschrijving 1").fill("DJ");
  await owner.getByLabel("Prijs excl. btw 1").fill("100");
  await owner.getByRole("button", { name: "Offerte versturen" }).click();
  await expect(owner.getByText("Offerte versie 1 verstuurd.")).toBeVisible();
  let link = "";
  await expect(async () => {
    const search = await (await request.get(`${MAILPIT}/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
    for (const m of search.messages ?? []) link = ((await (await request.get(`${MAILPIT}/message/${m.ID}`)).json()).Text as string).match(/https?:\/\/\S+\/q\/[\w-]+/)?.[0] ?? link;
    expect(link).not.toBe("");
  }).toPass({ timeout: 20_000 });

  await signIn(admin, ADMIN_EMAIL);
  await admin.goto("/nl/app/agencies?q=rotterdamdj");
  await admin.getByRole("link", { name: "Rotterdam DJ Collectief" }).first().click();
  await admin.getByRole("button", { name: "Opschorten" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Opschorten" }).click();
  await expect(admin.getByText("Bureau opgeschort.")).toBeVisible();
  try {
    await customer.goto(link);
    await expect(customer.getByText(/kan op dit moment geen nieuwe boekingen|can't take new bookings/)).toBeVisible();
    await expect(customer.locator("#accept-full-name")).toHaveCount(0);
  } finally {
    await admin.getByRole("button", { name: "Heractiveren" }).click();
    await expect(admin.getByRole("button", { name: "Opschorten" })).toBeVisible();
  }
});
