import { describe, expect, it } from "vitest";
import { bookingSectionKeys, bookingThemeSchema, defaultBookingTheme, normalizeBookingSections, parseBookingTheme } from "./booking-page";

describe("parseBookingTheme", () => {
  it("fills defaults for an empty or missing value", () => {
    expect(parseBookingTheme(null)).toEqual(defaultBookingTheme);
    expect(parseBookingTheme({})).toEqual(defaultBookingTheme);
    expect(defaultBookingTheme.sections.map((s) => s.key)).toEqual([...bookingSectionKeys]);
  });

  it("keeps valid choices", () => {
    const theme = parseBookingTheme({ hero: "split", accent: "#ff0066", mode: "dark", headline: "  Feest!  " });
    expect(theme).toMatchObject({ hero: "split", accent: "#ff0066", mode: "dark", headline: "Feest!" });
  });

  it("falls back to the defaults when a value no longer fits", () => {
    expect(parseBookingTheme({ hero: "carousel" })).toEqual(defaultBookingTheme);
    expect(parseBookingTheme({ accent: "red" })).toEqual(defaultBookingTheme);
    expect(parseBookingTheme({ overlay: 100 })).toEqual(defaultBookingTheme);
  });

  it("rejects overly long text", () => {
    expect(bookingThemeSchema.safeParse({ headline: "x".repeat(121) }).success).toBe(false);
  });
});

describe("normalizeBookingSections", () => {
  it("drops duplicates and appends missing sections", () => {
    const sections = normalizeBookingSections([
      { key: "booking", visible: true, heading: "Boek ons" },
      { key: "artists", visible: false, heading: "" },
      { key: "booking", visible: false, heading: "" },
    ]);
    expect(sections.map((s) => s.key)).toEqual(["booking", "artists", "intro", "reviews", "faq", "contact"]);
    expect(sections[0]).toEqual({ key: "booking", visible: true, heading: "Boek ons" });
    expect(sections[1]!.visible).toBe(false);
  });
});
