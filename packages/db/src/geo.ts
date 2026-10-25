import { prisma } from "./client";

/** city and region may hold several spellings joined by "|" (English and local). */
export type GeoResult = { latitude: number; longitude: number; city: string | null; region: string | null; country: string | null };

type Hit = { lat: string; lon: string; address?: Record<string, string> };

/** One Nominatim search; throws on network errors so nothing gets cached. */
async function lookup(query: string, language: string | null): Promise<Hit | null> {
  const url = `${endpoint}?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(query)}`;
  // Nominatim's policy asks for an identifying User-Agent and at most one request a second.
  const headers: Record<string, string> = { "User-Agent": "StageDesk/2.0 (support@stagedesk.pro)" };
  if (language) headers["Accept-Language"] = language;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error(`Geocoder: HTTP ${response.status}`);
  const [hit] = (await response.json()) as Hit[];
  return hit ?? null;
}

const endpoint = process.env.GEOCODER_URL ?? "https://nominatim.openstreetmap.org/search";

/**
 * Finds a place on the map with OpenStreetMap Nominatim. Answers are cached
 * (also "not found"), so each place is asked once; network errors aren't
 * cached and return null, so matching falls back to region names.
 */
export async function geocode(query: string): Promise<GeoResult | null> {
  const key = query.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 191);
  if (!key) return null;
  const cached = await prisma.geoCache.findUnique({ where: { query: key } });
  if (cached) return cached.latitude === null || cached.longitude === null ? null : { latitude: cached.latitude, longitude: cached.longitude, city: cached.city, region: cached.region, country: cached.country };

  let found: GeoResult | null = null;
  try {
    // Asked in English and in the place's own language, so "Zuid-Holland" and "South Holland" both match.
    const [en, local] = [await lookup(key, "en"), await lookup(key, null)];
    const hit = en ?? local;
    if (hit) {
      const both = (pick: (a: Record<string, string>) => string | undefined) =>
        [...new Set([en, local].map((h) => (h ? pick(h.address ?? {}) : undefined)).filter((v): v is string => Boolean(v)))].join("|").slice(0, 96) || null;
      found = {
        latitude: Number(hit.lat),
        longitude: Number(hit.lon),
        city: both((a) => a["city"] ?? a["town"] ?? a["village"] ?? a["municipality"]),
        region: both((a) => a["state"] ?? a["province"] ?? a["region"]),
        country: hit.address?.["country_code"]?.slice(0, 2).toUpperCase() ?? null,
      };
    }
  } catch {
    return null;
  }
  await prisma.geoCache.upsert({
    where: { query: key },
    create: { query: key, latitude: found?.latitude ?? null, longitude: found?.longitude ?? null, city: found?.city ?? null, region: found?.region ?? null, country: found?.country ?? null },
    update: {},
  });
  return found;
}
