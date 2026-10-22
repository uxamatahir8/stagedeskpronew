/** Budget choices on the public inquiry form. Upper bounds in cents; null = open-ended. */
export const budgetRanges = [
  { key: "lt_750", maxCents: 75_000 },
  { key: "750_1500", maxCents: 150_000 },
  { key: "1500_2500", maxCents: 250_000 },
  { key: "2500_4000", maxCents: 400_000 },
  { key: "gt_4000", maxCents: null },
] as const;

export type BudgetRange = (typeof budgetRanges)[number]["key"];

export function isBudgetRange(value: unknown): value is BudgetRange {
  return budgetRanges.some((r) => r.key === value);
}

export interface MediaEmbed {
  provider: "youtube" | "vimeo" | "soundcloud" | "mixcloud";
  /** URL safe to put in an iframe src. */
  embedUrl: string;
  /** The original link, for "open in new tab". */
  url: string;
}

/**
 * Turns a YouTube, Vimeo, SoundCloud or Mixcloud link into an embed URL.
 * Anything else returns null, so arbitrary sites can't be framed on a booking page.
 */
export function mediaEmbed(link: string): MediaEmbed | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\.|^m\./, "");

  if (host === "youtube.com" || host === "youtu.be") {
    const id = host === "youtu.be" ? url.pathname.slice(1) : url.searchParams.get("v") ?? url.pathname.match(/^\/(?:embed|shorts)\/([\w-]+)/)?.[1];
    return id && /^[\w-]{6,20}$/.test(id)
      ? { provider: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${id}`, url: url.toString() }
      : null;
  }
  if (host === "vimeo.com") {
    const id = url.pathname.match(/^\/(\d+)/)?.[1];
    return id ? { provider: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}`, url: url.toString() } : null;
  }
  if (host === "soundcloud.com") {
    return url.pathname.split("/").filter(Boolean).length >= 2
      ? {
          provider: "soundcloud",
          embedUrl: `https://w.soundcloud.com/player/?url=${encodeURIComponent(`https://soundcloud.com${url.pathname}`)}&visual=false&show_comments=false`,
          url: url.toString(),
        }
      : null;
  }
  if (host === "mixcloud.com") {
    return url.pathname.split("/").filter(Boolean).length >= 2
      ? {
          provider: "mixcloud",
          embedUrl: `https://player-widget.mixcloud.com/widget/iframe/?hide_cover=1&light=1&feed=${encodeURIComponent(url.pathname)}`,
          url: url.toString(),
        }
      : null;
  }
  return null;
}

/**
 * Dates on which every artist is unavailable or already playing.
 * `busy` maps "YYYY-MM-DD" to the ids of artists who can't play that day.
 */
export function fullyBookedDates(artistIds: readonly string[], busy: ReadonlyMap<string, ReadonlySet<string>>): string[] {
  if (artistIds.length === 0) return [];
  return [...busy.entries()]
    .filter(([, ids]) => artistIds.every((id) => ids.has(id)))
    .map(([date]) => date)
    .sort();
}
