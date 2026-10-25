import { describe, expect, it } from "vitest";
import { cleanRegions, distanceKm, normalizePlace, servesRequest } from "./geo";

const utrecht = { latitude: 52.0907, longitude: 5.1214 };
const amsterdam = { latitude: 52.3676, longitude: 4.9041 };
const maastricht = { latitude: 50.8514, longitude: 5.691 };

describe("distanceKm", () => {
  it("is about right between Dutch cities", () => {
    expect(distanceKm(utrecht, amsterdam)).toBeGreaterThan(33);
    expect(distanceKm(utrecht, amsterdam)).toBeLessThan(37);
    expect(distanceKm(utrecht, utrecht)).toBe(0);
  });
});

describe("places", () => {
  it("normalizes case, accents and punctuation", () => {
    expect(normalizePlace("  's-Hertogenbosch ")).toBe(normalizePlace("S-HERTOGENBOSCH"));
    expect(normalizePlace("Zürich")).toBe("zurich");
  });
  it("cleans region lists", () => {
    expect(cleanRegions(["Utrecht", " utrecht ", "", "Noord-Brabant"])).toEqual(["Utrecht", "Noord-Brabant"]);
  });
});

describe("servesRequest", () => {
  const area = { regions: ["Noord-Brabant", "Utrecht"], radiusKm: null, location: null, eventTypes: null };
  it("matches a region by city or province", () => {
    expect(servesRequest(area, { places: ["Utrecht"], location: null, eventType: "wedding" })).toBe(true);
    expect(servesRequest(area, { places: ["Eindhoven", "Noord-Brabant"], location: null, eventType: "wedding" })).toBe(true);
    expect(servesRequest(area, { places: ["Groningen", "Groningen"], location: null, eventType: "wedding" })).toBe(false);
  });
  it("matches within the radius", () => {
    const near = { regions: [], radiusKm: 50, location: utrecht, eventTypes: null };
    expect(servesRequest(near, { places: ["Amsterdam"], location: amsterdam, eventType: "party" })).toBe(true);
    expect(servesRequest(near, { places: ["Maastricht"], location: maastricht, eventType: "party" })).toBe(false);
  });
  it("respects the event types offered", () => {
    expect(servesRequest({ ...area, eventTypes: ["corporate"] }, { places: ["Utrecht"], location: null, eventType: "wedding" })).toBe(false);
  });
});
