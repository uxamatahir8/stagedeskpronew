import { z } from "zod";
import { siteFonts } from "./sites";

/**
 * How an agency's public booking page (/b/<slug>) looks: cover layout,
 * colours, type, and which sections appear in what order. Stored as JSON on
 * the organization; anything that no longer fits falls back to the defaults.
 */

const text = (max: number) => z.string().trim().max(max);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const bookingHeroLayouts = ["cover", "split", "banner", "minimal"] as const;
export const bookingArtistLayouts = ["grid", "portrait", "list"] as const;
export const bookingSectionKeys = ["intro", "artists", "reviews", "booking", "faq", "contact"] as const;
export type BookingSectionKey = (typeof bookingSectionKeys)[number];

const sectionSchema = z.object({
  key: z.enum(bookingSectionKeys),
  visible: z.boolean().default(true),
  /** Replaces the standard heading; "" keeps it. */
  heading: text(80).default(""),
});
export type BookingSection = z.infer<typeof sectionSchema>;

export const defaultBookingSections: BookingSection[] = bookingSectionKeys.map((key) => ({ key, visible: true, heading: "" }));

export const bookingThemeSchema = z.object({
  hero: z.enum(bookingHeroLayouts).default("cover"),
  /** How strongly the cover photo is darkened under the text, in percent. */
  overlay: z.int().min(0).max(90).default(55),
  /** "" uses the agency's brand colour. */
  accent: z.union([hex, z.literal("")]).default(""),
  font: z.enum(siteFonts).default("modern"),
  radius: z.enum(["sharp", "soft", "round"]).default("round"),
  mode: z.enum(["light", "dark"]).default("light"),
  headline: text(120).default(""),
  tagline: text(240).default(""),
  ctaLabel: text(40).default(""),
  artistLayout: z.enum(bookingArtistLayouts).default("grid"),
  /** Artists, rating and city in a strip under the cover. */
  showStats: z.boolean().default(true),
  sections: z.array(sectionSchema).max(bookingSectionKeys.length).default(defaultBookingSections),
});
export type BookingTheme = z.infer<typeof bookingThemeSchema>;

export const defaultBookingTheme: BookingTheme = bookingThemeSchema.parse({});

/** Every section exactly once, in the stored order; missing ones are appended so new sections show up. */
export function normalizeBookingSections(sections: readonly BookingSection[]): BookingSection[] {
  const seen = new Set<BookingSectionKey>();
  const out: BookingSection[] = [];
  for (const s of sections) {
    if (seen.has(s.key)) continue;
    seen.add(s.key);
    out.push(s);
  }
  for (const key of bookingSectionKeys) if (!seen.has(key)) out.push({ key, visible: true, heading: "" });
  return out;
}

/** A stored theme, or the defaults if it no longer fits. */
export function parseBookingTheme(value: unknown): BookingTheme {
  const parsed = bookingThemeSchema.safeParse(value ?? {});
  const theme = parsed.success ? parsed.data : defaultBookingTheme;
  return { ...theme, sections: normalizeBookingSections(theme.sections) };
}
