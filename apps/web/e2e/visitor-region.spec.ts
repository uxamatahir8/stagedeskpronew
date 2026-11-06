import { type Browser, expect, type Page, test } from "@playwright/test";
import { closeBrowserContexts } from "./helpers";

/**
 * Language and display currency by region and by choice. The country comes from
 * a test header here, the way an edge would add it; docs/operations/visitor-country.md
 * has the checks that need a real request from that country.
 */
test.afterEach(async ({ browser }) => closeBrowserContexts(browser));

type Visitor = { country?: string; browser?: string; phone?: boolean; cookies?: Record<string, string> };

async function visitor(browser: Browser, v: Visitor) {
  const context = await browser.newContext({
    locale: v.browser ?? "en-GB",
    extraHTTPHeaders: v.country ? { "CF-IPCountry": v.country } : {},
    ...(v.phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {}),
  });
  await context.addCookies(Object.entries(v.cookies ?? {}).map(([name, value]) => ({ name, value, url: "http://localhost:3000/" })));
  return context.newPage();
}

const currencyMenu = (page: Page) => page.getByRole("combobox", { name: /^(Prices in|Prijzen in)/ });
const languageMenu = (page: Page) => page.getByRole("button", { name: /^(Language|Taal):/ });

/** The language (from the address and the document) and the currency the header shows. */
async function expectShown(page: Page, language: "nl" | "en", currency: string) {
  await expect(page.locator("html")).toHaveAttribute("lang", language);
  expect(new URL(page.url()).pathname.startsWith("/nl")).toBe(language === "nl");
  await expect(currencyMenu(page)).toHaveText(new RegExp(currency));
}

async function pickCurrency(page: Page, name: RegExp) {
  await currencyMenu(page).click();
  await page.getByRole("option", { name }).click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
}

async function pickLanguage(page: Page, name: RegExp) {
  await languageMenu(page).click();
  await page.getByRole("menuitem", { name }).click();
}

const cookieNames = async (page: Page) => (await page.context().cookies()).map((c) => c.name);

test.describe("a first visit", () => {
  const cases: [number, string | undefined, string, "nl" | "en", string][] = [
    [1, "NL", "en-GB", "nl", "EUR"],
    [2, "NL", "nl-NL", "nl", "EUR"],
    [3, "GB", "en-GB", "en", "GBP"],
    [4, "US", "en-US", "en", "USD"],
    [5, "BE", "nl-BE", "nl", "EUR"],
    [6, "BE", "en-GB", "en", "EUR"],
    [7, undefined, "nl-NL", "nl", "EUR"],
    [8, undefined, "en-GB", "en", "GBP"],
  ];
  for (const [n, country, language, shownLanguage, currency] of cases) {
    test(`${n}: ${country ?? "unknown"} with a ${language} browser gets ${shownLanguage} and ${currency}`, async ({ browser }) => {
      const page = await visitor(browser, { country, browser: language });
      await page.goto("/");
      await expectShown(page, shownLanguage, currency);
      // A guess stays a guess.
      expect(await cookieNames(page)).not.toContain("locale_choice");
      expect(await cookieNames(page)).not.toContain("display_currency");
    });
  }

  test("an unknown country code counts as no country", async ({ browser }) => {
    const page = await visitor(browser, { country: "XX", browser: "nl-NL" });
    await page.goto("/");
    await expectShown(page, "nl", "EUR");
  });
});

test("9, 10: choices made in the Netherlands survive refreshes and navigation, independently", async ({ browser }) => {
  const page = await visitor(browser, { country: "NL", browser: "en-GB" });
  await page.goto("/");
  await expectShown(page, "nl", "EUR");

  await pickLanguage(page, /^(English|Engels)/);
  await expect(page).toHaveURL(/localhost:3000\/$/);
  await expectShown(page, "en", "EUR"); // the currency didn't move with the language
  await page.reload();
  await expectShown(page, "en", "EUR");

  await pickCurrency(page, /GBP/);
  await expectShown(page, "en", "GBP");
  await page.reload();
  await expectShown(page, "en", "GBP");

  await page.goto("/pricing");
  await expectShown(page, "en", "GBP");

  await pickLanguage(page, /^(Dutch|Nederlands)/);
  await expect(page).toHaveURL(/\/nl\/pricing$/);
  await expectShown(page, "nl", "GBP"); // the language didn't reset the currency
});

test("back to automatic restores the regional language and currency, one at a time", async ({ browser }) => {
  const page = await visitor(browser, { country: "NL", browser: "en-GB", cookies: { locale_choice: "en", display_currency: "GBP" } });
  await page.goto("/pricing");
  await expectShown(page, "en", "GBP");

  await pickCurrency(page, /^Automatic/);
  await expectShown(page, "en", "EUR");
  expect(await cookieNames(page)).not.toContain("display_currency");

  await pickLanguage(page, /^Automatic/);
  await expect(page).toHaveURL(/\/nl\/pricing$/);
  await expectShown(page, "nl", "EUR");
  expect(await cookieNames(page)).not.toContain("locale_choice");
});

test("picking the language or currency already detected makes it a choice", async ({ browser }) => {
  const page = await visitor(browser, { country: "GB", browser: "en-GB" });
  await page.goto("/");
  await pickLanguage(page, /^(English|Engels)/);
  await expect.poll(() => cookieNames(page)).toContain("locale_choice");
  await pickCurrency(page, /GBP/);
  await expect.poll(() => cookieNames(page)).toContain("display_currency");
  await page.context().setExtraHTTPHeaders({ "CF-IPCountry": "NL" });
  await page.goto("/");
  await expectShown(page, "en", "GBP");
});

test("11: a /nl address stays Dutch", async ({ browser }) => {
  const inNl = await visitor(browser, { country: "NL", browser: "en-GB" });
  await inNl.goto("/nl/pricing");
  await expectShown(inNl, "nl", "EUR");

  // Abroad too, with their own currency; language and currency are separate.
  const inUk = await visitor(browser, { country: "GB", browser: "en-GB" });
  await inUk.goto("/nl/pricing");
  await expectShown(inUk, "nl", "GBP");

  const choseEnglish = await visitor(browser, { country: "NL", browser: "en-GB", cookies: { locale_choice: "en" } });
  await choseEnglish.goto("/nl/pricing");
  await expectShown(choseEnglish, "nl", "EUR");
});

test("12: a returning visitor without a choice is detected again, even with the old cookie", async ({ browser }) => {
  const page = await visitor(browser, { country: "NL", browser: "en-GB", cookies: { visitor_locale: "en" } });
  await page.goto("/");
  await expectShown(page, "nl", "EUR");
  expect(await cookieNames(page)).not.toContain("visitor_locale");
  await page.goto("/pricing");
  await expectShown(page, "nl", "EUR");
});

test("moving to another country or VPN exit follows the new country, unless they chose", async ({ browser }) => {
  const page = await visitor(browser, { country: "NL", browser: "en-GB" });
  await page.goto("/");
  await expectShown(page, "nl", "EUR");
  await page.context().setExtraHTTPHeaders({ "CF-IPCountry": "US" });
  await page.goto("/pricing");
  await expectShown(page, "en", "USD");
  await page.context().setExtraHTTPHeaders({});
  await page.goto("/pricing");
  await expectShown(page, "en", "GBP"); // no country: the en-GB browser decides
});

test("an /en address ends up on the visitor's language, never on /nl/en", async ({ browser }) => {
  const page = await visitor(browser, { country: "NL", browser: "en-GB" });
  await page.goto("/en/pricing");
  await expect(page).toHaveURL(/\/nl\/pricing$/);
  await expectShown(page, "nl", "EUR");
});

test("invalid cookies count as no choice", async ({ browser }) => {
  const page = await visitor(browser, { country: "NL", browser: "en-GB", cookies: { locale_choice: "xx", display_currency: "XXX" } });
  await page.goto("/pricing");
  await expectShown(page, "nl", "EUR");
});

test("13, 14: prices follow the display currency, and the page says what is charged", async ({ browser }) => {
  const page = await visitor(browser, { country: "NL", browser: "en-GB" });
  await page.goto("/pricing");
  await expectShown(page, "nl", "EUR");
  const main = page.getByRole("main");
  await expect(main).toContainText("€");
  await expect(main).not.toContainText("Je betaalt in euro's");

  await pickCurrency(page, /GBP/);
  await expect(main).toContainText("£");
  // Marked as an estimate, with the real euro amount alongside.
  await expect(main).toContainText("Je betaalt in euro's");
  await expect(main.getByText(/Gefactureerd als €\s?\d/).first()).toBeVisible();
});

test("15: visitors from different places taking turns don't see each other's answer", async ({ browser }) => {
  const nl = await visitor(browser, { country: "NL", browser: "en-GB" });
  const uk = await visitor(browser, { country: "GB", browser: "en-GB" });
  const us = await visitor(browser, { country: "US", browser: "en-US" });
  for (let round = 0; round < 2; round++) {
    await nl.goto("/pricing");
    await expectShown(nl, "nl", "EUR");
    await uk.goto("/pricing");
    await expectShown(uk, "en", "GBP");
    await us.goto("/pricing");
    await expectShown(us, "en", "USD");
  }

  const asked = { Accept: "text/html" };
  const redirect = await nl.request.get("/pricing", { headers: { ...asked, "CF-IPCountry": "NL" }, maxRedirects: 0 });
  expect(redirect.status()).toBe(307);
  expect(redirect.headers()["cache-control"]).toBe("private, no-store");
  for (const country of ["GB", "US"]) {
    const page = await uk.request.get("/pricing", { headers: { ...asked, "CF-IPCountry": country }, maxRedirects: 0 });
    expect(page.status()).toBe(200);
    expect(page.headers()["cache-control"]).not.toMatch(/public|s-maxage/);
  }
});

test("16: on a phone, the menu keeps detected and chosen settings", async ({ browser }) => {
  const openPricing = async (page: Page, menu: RegExp, link: RegExp) => {
    await page.getByRole("button", { name: menu }).click();
    await page.getByRole("dialog").getByRole("link", { name: link }).first().click();
    await expect(page).toHaveURL(/\/pricing$/);
  };

  const detected = await visitor(browser, { country: "NL", browser: "en-GB", phone: true });
  await detected.goto("/");
  await expectShown(detected, "nl", "EUR");
  await openPricing(detected, /Menu openen/, /^Prijzen$/);
  await expectShown(detected, "nl", "EUR");

  const chose = await visitor(browser, { country: "NL", browser: "en-GB", phone: true });
  await chose.goto("/");
  await pickLanguage(chose, /^(English|Engels)/);
  await expect(chose).toHaveURL(/localhost:3000\/$/);
  await pickCurrency(chose, /GBP/);
  await expectShown(chose, "en", "GBP");
  await openPricing(chose, /Open menu/, /^Pricing$/);
  await expectShown(chose, "en", "GBP");
  await chose.reload();
  await expectShown(chose, "en", "GBP");
});

test("crawlers keep the address they asked for, with its own canonical", async ({ browser }) => {
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    locale: "nl-NL",
    extraHTTPHeaders: { "CF-IPCountry": "NL" },
  });
  const page = await context.newPage();
  await page.goto("/pricing");
  expect(new URL(page.url()).pathname).toBe("/pricing");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/pricing$/);
  await expect(page.locator('link[rel="alternate"][hreflang="nl"]')).toHaveAttribute("href", /\/nl\/pricing$/);
});
