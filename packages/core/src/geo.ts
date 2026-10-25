/**
 * Matching a quote request to the agencies and artists who serve its area:
 * by a named region (city, province or state) or by distance from their
 * address. Both may be set; either one is enough.
 */

export type LatLng = { latitude: number; longitude: number };

/** Great-circle distance in km. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "  's-Hertogenbosch " and "S-HERTOGENBOSCH" compare equal; so do "Zürich" and "zurich". */
export function normalizePlace(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Cleans a typed list of regions: trimmed, no blanks or duplicates, at most 50. */
export function cleanRegions(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = raw.trim().slice(0, 96);
    const key = normalizePlace(v);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out.slice(0, 50);
}

export type ServiceArea = {
  regions: string[];
  radiusKm: number | null;
  location: LatLng | null;
  /** null = every event type. */
  eventTypes: string[] | null;
};

export type RequestPlace = {
  /** The city as typed, and the city and province/state the map found for it. */
  places: string[];
  location: LatLng | null;
  eventType: string;
};

/** Whether a provider's service area covers a request. */
export function servesRequest(area: ServiceArea, request: RequestPlace): boolean {
  if (area.eventTypes && area.eventTypes.length > 0 && !area.eventTypes.includes(request.eventType)) return false;
  const wanted = new Set(request.places.map(normalizePlace).filter(Boolean));
  if (area.regions.some((r) => wanted.has(normalizePlace(r)))) return true;
  if (area.radiusKm && area.location && request.location) return distanceKm(area.location, request.location) <= area.radiusKm;
  return false;
}
