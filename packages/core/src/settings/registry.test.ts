import { describe, expect, it } from "vitest";
import { parseSetting, settingKeys, settingsRegistry, validateSetting } from "./registry";

describe("settings registry", () => {
  it("has valid defaults for every key", () => {
    for (const key of settingKeys) {
      expect(() => settingsRegistry[key].schema.parse(settingsRegistry[key].defaults)).not.toThrow();
    }
  });

  it("falls back to defaults when a stored value is missing or invalid", () => {
    expect(parseSetting("bookings.defaults", null).quoteExpiryDays).toBe(14);
    expect(parseSetting("bookings.defaults", { quoteExpiryDays: "soon" }).depositBps).toBe(3_000);
  });

  it("rejects invalid admin input", () => {
    const valid = settingsRegistry["fees.platform"].defaults;
    expect(() =>
      validateSetting("fees.platform", { ...valid, defaultRule: { ...valid.defaultRule, minCents: 900, maxCents: 100 } }),
    ).toThrow();
  });
});
