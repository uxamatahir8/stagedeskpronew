/**
 * What a customer may change about their own event. Wishes (music, do's and
 * don'ts) don't touch the contract, so the customer edits them directly while
 * the event is still ahead. Date, times, venue, type and guests can affect
 * availability, price and equipment: before a quote is out the customer changes
 * them directly, afterwards they ask and the agency decides.
 */

export const customerPreferenceFields = ["preferredGenre", "dos", "donts", "playlistUrl", "musicRequests", "specialRequests"] as const;
export type CustomerPreferenceField = (typeof customerPreferenceFields)[number];

const openStatuses = ["inquiry", "quoted", "expired", "booked", "confirmed"];

/** Whether wishes can still be edited: the booking is alive and the event hasn't passed. */
export function customerPreferencesOpen(status: string, eventDate: string | null, today: string) {
  if (!openStatuses.includes(status)) return false;
  return eventDate === null || eventDate >= today;
}

export type CustomerChangeMode = "direct" | "request" | "closed";

/** How a change to the contract details goes: straight through, as a request to the agency, or not at all. */
export function customerChangeMode(status: string, eventDate: string | null, today: string): CustomerChangeMode {
  if (status === "inquiry" || status === "expired") return "direct";
  if ((status === "quoted" || status === "booked" || status === "confirmed") && (eventDate === null || eventDate >= today)) return "request";
  return "closed";
}

export const musicProviders = ["spotify", "apple_music", "youtube", "soundcloud", "mixcloud", "tidal", "deezer"] as const;
export type MusicProvider = (typeof musicProviders)[number];

const providerHosts: Record<string, MusicProvider> = {
  "open.spotify.com": "spotify",
  "spotify.link": "spotify",
  "music.apple.com": "apple_music",
  "music.youtube.com": "youtube",
  "youtube.com": "youtube",
  "www.youtube.com": "youtube",
  "youtu.be": "youtube",
  "soundcloud.com": "soundcloud",
  "www.soundcloud.com": "soundcloud",
  "mixcloud.com": "mixcloud",
  "www.mixcloud.com": "mixcloud",
  "tidal.com": "tidal",
  "listen.tidal.com": "tidal",
  "deezer.com": "deezer",
  "www.deezer.com": "deezer",
  "link.deezer.com": "deezer",
};

const spotifyPath = /^\/(?:intl-[a-z-]+\/)?(?:playlist|album)\/[A-Za-z0-9]+\/?$/;

/**
 * A playlist link we'll store and show: https on a known music service, with
 * no credentials or unusual port. Spotify links must point at a playlist or
 * album; a spotify:playlist: URI is turned into its web address. Returns null
 * for anything else, so arbitrary addresses never reach a customer or artist.
 */
export function playlistLink(input: string | null | undefined): { url: string; provider: MusicProvider } | null {
  const raw = input?.trim();
  if (!raw || raw.length > 500) return null;
  const uri = raw.match(/^spotify:(playlist|album):([A-Za-z0-9]+)$/);
  let parsed: URL;
  try {
    parsed = new URL(uri ? `https://open.spotify.com/${uri[1]}/${uri[2]}` : raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return null;
  const provider = providerHosts[parsed.hostname.toLowerCase()];
  if (!provider) return null;
  if (parsed.hostname.toLowerCase() === "open.spotify.com" && !spotifyPath.test(parsed.pathname)) return null;
  if (parsed.pathname === "/" || parsed.pathname === "") return null;
  return { url: parsed.toString(), provider };
}

export interface ChangeConflict {
  field: string;
  /** When the customer asked. */
  original: string | number | null;
  requested: string | number | null;
  /** What the booking says now, which someone else put there since. */
  current: string | number | null;
}

const sameValue = (a: unknown, b: unknown) => {
  const norm = (v: unknown) => (v === null || v === undefined || v === "" ? "" : String(v).trim().toLowerCase());
  return norm(a) === norm(b);
};

/**
 * Fields of a change request that someone else changed since it was asked. A
 * different field changing isn't a conflict, nor is the booking already holding
 * the requested value. Compared field by field: the database reorders JSON keys.
 */
export function changeConflicts(changes: unknown, baseline: unknown, current: Record<string, string | number | null>): ChangeConflict[] {
  const requested = (changes ?? {}) as Record<string, string | number | null>;
  const original = (baseline ?? {}) as Record<string, string | number | null>;
  return Object.keys(requested)
    .sort()
    .filter((field) => !sameValue(current[field], original[field]) && !sameValue(current[field], requested[field]))
    .map((field) => ({ field, original: original[field] ?? null, requested: requested[field] ?? null, current: current[field] ?? null }));
}

/** Identifies what a reviewer saw: overriding is only accepted for exactly these current values. */
export const conflictFingerprint = (conflicts: ChangeConflict[]) => JSON.stringify(conflicts.map((c) => [c.field, c.current]));
