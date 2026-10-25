import { describe, expect, it } from "vitest";
import { defaultDatePrefs, formatDateTime, isTimeZone, resolveDatePrefs, timeZoneOffset } from "./datetime";

// 25 October 2026, 19:05 UTC: 20:05 in Amsterdam (summer time ended at 01:00 UTC that day).
const at = new Date(Date.UTC(2026, 9, 25, 19, 5, 0));
const full = { day: "numeric", month: "short", year: "numeric" } as const;

describe("resolveDatePrefs", () => {
  it("takes the most specific valid value per field", () => {
    expect(resolveDatePrefs({ timeFormat: "12h" }, { timeZone: "Asia/Karachi", dateFormat: "yyyy-mm-dd" }, null)).toEqual({
      timeZone: "Asia/Karachi",
      dateFormat: "yyyy-mm-dd",
      timeFormat: "12h",
    });
  });
  it("ignores unknown or invalid values", () => {
    expect(resolveDatePrefs({ timeZone: "Mars/Olympus", dateFormat: "weird", timeFormat: null })).toEqual(defaultDatePrefs);
  });
});

describe("formatDateTime", () => {
  it("applies the chosen pattern to full dates", () => {
    const base = { ...defaultDatePrefs, timeZone: "UTC" };
    expect(formatDateTime(at, full, { ...base, dateFormat: "dd-mm-yyyy" }, "en")).toBe("25-10-2026");
    expect(formatDateTime(at, full, { ...base, dateFormat: "mm/dd/yyyy" }, "en")).toBe("10/25/2026");
    expect(formatDateTime(at, full, { ...base, dateFormat: "yyyy-mm-dd" }, "en")).toBe("2026-10-25");
    expect(formatDateTime(at, full, { ...base, dateFormat: "d mmm yyyy" }, "en")).toBe("25 Oct 2026");
    expect(formatDateTime(at, full, { ...base, dateFormat: "mmm d, yyyy" }, "en")).toBe("Oct 25, 2026");
  });
  it("uses the person's timezone and clock", () => {
    const t = { ...full, hour: "2-digit", minute: "2-digit" } as const;
    expect(formatDateTime(at, t, { timeZone: "Europe/Amsterdam", dateFormat: "dd-mm-yyyy", timeFormat: "24h" }, "en")).toBe("25-10-2026, 20:05");
    expect(formatDateTime(at, t, { timeZone: "Asia/Karachi", dateFormat: "yyyy-mm-dd", timeFormat: "12h" }, "en")).toMatch(/^2026-10-26, 12:05\sAM$/);
  });
  it("keeps a pinned timezone for date-only values", () => {
    const late = new Date(Date.UTC(2026, 9, 25, 12));
    expect(formatDateTime(late, { ...full, timeZone: "UTC" }, { ...defaultDatePrefs, timeZone: "Pacific/Kiritimati", dateFormat: "dd-mm-yyyy" }, "en")).toBe("25-10-2026");
  });
  it("leaves month-only and locale formats to Intl", () => {
    expect(formatDateTime(at, { month: "long", year: "numeric", timeZone: "UTC" }, { ...defaultDatePrefs, dateFormat: "dd-mm-yyyy" }, "en")).toBe("October 2026");
  });
});

describe("timezones", () => {
  it("validates and labels", () => {
    expect(isTimeZone("Europe/Amsterdam")).toBe(true);
    expect(isTimeZone("Nope/Nowhere")).toBe(false);
    expect(timeZoneOffset("UTC", at)).toBe("UTC+00:00");
    expect(timeZoneOffset("Asia/Karachi", at)).toBe("UTC+05:00");
  });
});
