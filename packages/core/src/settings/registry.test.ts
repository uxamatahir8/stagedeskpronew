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

  it("only takes real video links and safe images on the website proof", () => {
    const proof = settingsRegistry["site.proof"].defaults;
    expect(() => validateSetting("site.proof", { ...proof, tourVideoUrl: "https://youtu.be/abcdef123" })).not.toThrow();
    expect(() => validateSetting("site.proof", { ...proof, tourVideoUrl: "https://soundcloud.com/a/b" })).toThrow();
    expect(() => validateSetting("site.proof", { ...proof, tourVideoUrl: "javascript:alert(1)" })).toThrow();
    const logo = { name: "Agency", imageUrl: "/files/site/a.png", url: "" };
    expect(() => validateSetting("site.proof", { ...proof, logos: [logo] })).not.toThrow();
    expect(() => validateSetting("site.proof", { ...proof, logos: [{ ...logo, imageUrl: "javascript:x" }] })).toThrow();
    expect(() => validateSetting("site.proof", { ...proof, logos: [{ ...logo, url: "javascript:x" }] })).toThrow();
  });
});
