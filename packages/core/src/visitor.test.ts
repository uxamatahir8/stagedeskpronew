import { describe, expect, it } from "vitest";
import { acceptedLanguages, currencyForCountry, isCrawler, visitorCountry, visitorCurrency, visitorLocale } from "./visitor";

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

describe("isCrawler", () => {
  it("spots search engines", () => {
    expect(isCrawler("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isCrawler("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130")).toBe(false);
  });
});
