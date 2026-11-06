import { describe, expect, it } from "vitest";
import { acceptedLanguages, chosenCurrency, chosenLocale, currencyForCountry, isCrawler, visitorCountry, visitorCurrency, visitorLanguage, visitorLocale } from "./visitor";

const headers = (h: Record<string, string>) => (name: string) => h[name] ?? null;

describe("visitorCountry", () => {
  it("reads the edge's country header", () => {
    expect(visitorCountry(headers({ "cf-ipcountry": "nl" }))).toBe("NL");
    expect(visitorCountry(headers({ "x-vercel-ip-country": "US" }))).toBe("US");
    expect(visitorCountry(headers({}))).toBeNull();
  });

  it("ignores unknown and Tor", () => {
    expect(visitorCountry(headers({ "cf-ipcountry": "XX" }))).toBeNull();
    expect(visitorCountry(headers({ "cf-ipcountry": "T1" }))).toBeNull();
    expect(visitorCountry(headers({ "cf-ipcountry": "Netherlands" }))).toBeNull();
  });
});

describe("acceptedLanguages", () => {
  it("orders by preference", () => {
    expect(acceptedLanguages("en;q=0.5, nl-BE, nl;q=0.9")).toEqual([
      { language: "nl", region: "BE" },
      { language: "nl", region: null },
      { language: "en", region: null },
    ]);
    expect(acceptedLanguages("*")).toEqual([]);
    expect(acceptedLanguages(null)).toEqual([]);
  });
});

describe("visitorLocale", () => {
  it("is Dutch in the Netherlands, English elsewhere", () => {
    expect(visitorLocale({ country: "NL", acceptLanguage: "en-US" })).toBe("nl");
    expect(visitorLocale({ country: "DE", acceptLanguage: "nl-NL" })).toBe("en");
    expect(visitorLocale({ country: "PK", acceptLanguage: "en" })).toBe("en");
  });

  it("lets the browser decide in partly Dutch-speaking countries", () => {
    expect(visitorLocale({ country: "BE", acceptLanguage: "nl-BE,nl;q=0.9" })).toBe("nl");
    expect(visitorLocale({ country: "BE", acceptLanguage: "fr-BE" })).toBe("en");
  });

  it("falls back to the browser's first language without a country", () => {
    expect(visitorLocale({ country: null, acceptLanguage: "nl-NL,en;q=0.8" })).toBe("nl");
    expect(visitorLocale({ country: null, acceptLanguage: "en-GB,nl;q=0.8" })).toBe("en");
    expect(visitorLocale({ country: null, acceptLanguage: null })).toBe("en");
  });
});

describe("visitorCurrency", () => {
  const offered = ["EUR", "USD", "GBP", "PKR"];
  it("uses the country's currency when it's offered", () => {
    expect(visitorCurrency({ country: "NL", acceptLanguage: null }, offered)).toBe("EUR");
    expect(visitorCurrency({ country: "US", acceptLanguage: null }, offered)).toBe("USD");
    expect(visitorCurrency({ country: "PK", acceptLanguage: null }, offered)).toBe("PKR");
    expect(visitorCurrency({ country: "CH", acceptLanguage: null }, offered)).toBe("EUR");
    expect(visitorCurrency({ country: "JP", acceptLanguage: null }, offered)).toBe("EUR");
  });

  it("falls back to the browser's region", () => {
    expect(visitorCurrency({ country: null, acceptLanguage: "en-GB,en;q=0.9" }, offered)).toBe("GBP");
    expect(visitorCurrency({ country: null, acceptLanguage: "en" }, offered)).toBe("EUR");
  });

  it("knows the eurozone", () => {
    expect(currencyForCountry("BE")).toBe("EUR");
    expect(currencyForCountry("GB")).toBe("GBP");
    expect(currencyForCountry(null)).toBeNull();
  });
});

describe("first visit by country and browser", () => {
  const offered = ["EUR", "USD", "GBP", "CHF", "PKR", "INR"];
  const cases: [country: string | null, browser: string, locale: string, currency: string][] = [
    ["NL", "en-GB,en;q=0.9", "nl", "EUR"],
    ["NL", "nl-NL,nl;q=0.9", "nl", "EUR"],
    ["GB", "en-GB,en;q=0.9", "en", "GBP"],
    ["US", "en-US,en;q=0.9", "en", "USD"],
    ["BE", "nl-BE,nl;q=0.9", "nl", "EUR"],
    ["BE", "en-GB,en;q=0.9", "en", "EUR"],
    ["DE", "de-DE,de;q=0.9", "en", "EUR"],
    ["CH", "de-CH", "en", "CHF"],
    ["PK", "en-PK", "en", "PKR"],
    ["IN", "en-IN", "en", "INR"],
    [null, "nl-NL,nl;q=0.9", "nl", "EUR"],
    [null, "nl", "nl", "EUR"],
    [null, "en-GB,en;q=0.9", "en", "GBP"],
  ];
  it.each(cases)("%s with %s gets %s and %s", (country, acceptLanguage, locale, currency) => {
    expect(visitorLanguage({ choice: null, country, acceptLanguage })).toBe(locale);
    expect(visitorCurrency({ country, acceptLanguage }, offered)).toBe(currency);
  });

  it("the country beats the browser's region: a UK browser in the Netherlands sees euros", () => {
    expect(visitorCurrency({ country: "NL", acceptLanguage: "en-GB" }, offered)).toBe("EUR");
  });

  it("falls back to euros when the regional currency isn't offered", () => {
    expect(visitorCurrency({ country: "GB", acceptLanguage: "en-GB" }, ["EUR", "USD"])).toBe("EUR");
    expect(visitorCurrency({ country: null, acceptLanguage: "en-GB" }, ["EUR", "USD"])).toBe("EUR");
  });
});

describe("explicit choices", () => {
  it("a chosen language beats the country and the browser", () => {
    expect(visitorLanguage({ choice: "en", country: "NL", acceptLanguage: "nl-NL" })).toBe("en");
    expect(visitorLanguage({ choice: "nl", country: "US", acceptLanguage: "en-US" })).toBe("nl");
  });

  it("an invalid language cookie counts as no choice", () => {
    expect(chosenLocale("xx")).toBeNull();
    expect(chosenLocale("")).toBeNull();
    expect(chosenLocale(undefined)).toBeNull();
    expect(visitorLanguage({ choice: "xx", country: "NL", acceptLanguage: "en-GB" })).toBe("nl");
  });

  it("a chosen currency counts only while it's valid and offered", () => {
    expect(chosenCurrency("GBP", ["EUR", "GBP"])).toBe("GBP");
    expect(chosenCurrency("GBP", ["EUR"])).toBeNull();
    expect(chosenCurrency("XXX", ["EUR", "XXX"])).toBeNull();
    expect(chosenCurrency("auto", ["EUR"])).toBeNull();
    expect(chosenCurrency(undefined, ["EUR"])).toBeNull();
  });
});

describe("isCrawler", () => {
  it("spots search engines", () => {
    expect(isCrawler("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isCrawler("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130")).toBe(false);
  });
});
