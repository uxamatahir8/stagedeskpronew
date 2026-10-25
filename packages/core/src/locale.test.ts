import { describe, expect, it } from "vitest";
import { localePrefix, toLocale } from "./locale";

describe("locales", () => {
  it("leaves English unprefixed and puts others under their code", () => {
    expect(localePrefix("en")).toBe("");
    expect(localePrefix("nl")).toBe("/nl");
    expect(localePrefix(null)).toBe("");
    expect(localePrefix("de")).toBe("");
  });
  it("falls back to English", () => {
    expect(toLocale("nl")).toBe("nl");
    expect(toLocale(undefined)).toBe("en");
    expect(toLocale("fr")).toBe("en");
  });
});
