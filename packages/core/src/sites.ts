import { z } from "zod";
import { isSafeImageUrl } from "./pages";

/**
 * Agency websites: each agency builds pages from sections in the site
 * editor. Sections are data (never HTML); text supports the same inline
 * formatting as builder pages (parseInline). Artists, packages and reviews
 * are filled from the agency's own records when the page is shown.
 */

const text = (max: number) => z.string().trim().max(max);
const image = z.string().trim().max(500).refine((u) => u === "" || isSafeImageUrl(u), "unsafe url");

export const sectionBackgrounds = ["default", "muted", "brand"] as const;
export const ctaTargets = ["booking", "contact", "url"] as const;
export const highlightIcons = ["music", "heart", "star", "sparkles", "calendar", "shield", "users", "mic"] as const;

const base = {
  id: z.string().min(1).max(64),
  background: z.enum(sectionBackgrounds).default("default"),
};
const cta = {
  ctaLabel: text(60).default(""),
  ctaTarget: z.enum(ctaTargets).default("booking"),
  ctaUrl: z
    .string()
    .trim()
    .max(500)
    .refine((u) => u === "" || /^https?:\/\/[^\s"'<>]+$/.test(u), "unsafe url")
    .default(""),
};

export const sectionSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("hero"), title: text(160).min(1), subtitle: text(400).default(""), image: image.default(""), align: z.enum(["left", "center"]).default("center"), ...cta }),
  z.object({ ...base, type: z.literal("text"), heading: text(160).default(""), body: text(8000).min(1) }),
  z.object({
    ...base,
    type: z.literal("highlights"),
    heading: text(160).default(""),
    items: z.array(z.object({ icon: z.enum(highlightIcons), title: text(80).min(1), body: text(400).default("") })).min(1).max(6),
  }),
  z.object({ ...base, type: z.literal("artists"), heading: text(160).default(""), intro: text(400).default(""), max: z.int().min(1).max(24).default(6) }),
  z.object({ ...base, type: z.literal("packages"), heading: text(160).default(""), intro: text(400).default(""), showPrices: z.boolean().default(true) }),
  z.object({ ...base, type: z.literal("reviews"), heading: text(160).default(""), max: z.int().min(1).max(12).default(3) }),
  z.object({
    ...base,
    type: z.literal("gallery"),
    heading: text(160).default(""),
    images: z.array(z.object({ url: image.refine((u) => u !== "", "required"), alt: text(200).default("") })).min(1).max(24),
  }),
  z.object({ ...base, type: z.literal("video"), heading: text(160).default(""), url: z.string().trim().max(500).default("") }),
  z.object({ ...base, type: z.literal("faq"), heading: text(160).default(""), items: z.array(z.object({ q: text(200).min(1), a: text(2000).min(1) })).min(1).max(20) }),
  z.object({ ...base, type: z.literal("cta"), heading: text(160).min(1), body: text(400).default(""), ...cta }),
  z.object({ ...base, type: z.literal("booking"), heading: text(160).default(""), intro: text(400).default("") }),
  z.object({ ...base, type: z.literal("contact"), heading: text(160).default(""), intro: text(400).default("") }),
]);
export type Section = z.infer<typeof sectionSchema>;
export type SectionType = Section["type"];
export const sectionTypes = ["hero", "text", "highlights", "artists", "packages", "reviews", "gallery", "video", "faq", "cta", "booking", "contact"] as const satisfies readonly SectionType[];

export const sitePageLocaleSchema = z.object({
  title: text(120).min(1),
  seoTitle: text(70).default(""),
  seoDescription: text(170).default(""),
  sections: z.array(sectionSchema).max(40),
});
export type SitePageLocale = z.infer<typeof sitePageLocaleSchema>;

/** A page in both languages. English is optional: without it the Dutch page is shown. */
export const sitePageContentSchema = z.object({ nl: sitePageLocaleSchema, en: sitePageLocaleSchema.nullable().default(null) });
export type SitePageContent = z.infer<typeof sitePageContentSchema>;

export const siteFonts = ["modern", "classic", "rounded", "bold"] as const;
export const siteThemeSchema = z.object({
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  font: z.enum(siteFonts),
  radius: z.enum(["sharp", "soft", "round"]),
  /** Dark header and hero, or light. */
  mode: z.enum(["light", "dark"]),
});
export type SiteTheme = z.infer<typeof siteThemeSchema>;
export const defaultSiteTheme: SiteTheme = { primary: "#572261", accent: "#d6337f", font: "modern", radius: "soft", mode: "light" };

/** A stored theme, or the default if it no longer fits. */
export function parseSiteTheme(value: unknown): SiteTheme {
  const parsed = siteThemeSchema.safeParse(value);
  return parsed.success ? parsed.data : defaultSiteTheme;
}

/** Page addresses on an agency site: lowercase words with hyphens; "" is the home page. */
export const sitePageSlug = z.string().trim().toLowerCase().regex(/^$|^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(60);
/** Addresses the site itself needs. */
export const reservedSiteSlugs = ["en", "sitemap.xml", "robots.txt", "api", "files", "_next"];

/** A hostname an agency can connect: letters, digits and hyphens per label, at least one dot, no scheme or path. */
export function normalizeHostname(input: string): string | null {
  const host = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (host.length > 253 || !/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/.test(host)) return null;
  return host;
}

/** Hostnames that never belong to an agency site (the platform's own). */
export function isPlatformHost(host: string, platformHosts: string[]) {
  return platformHosts.includes(host) || host === "localhost" || host === "127.0.0.1";
}

/**
 * Which site a request is for: a free subdomain of the sites base domain
 * (feestband.stagedesk.site, or feestband.localhost in development), or a
 * custom domain. Null for the platform's own hosts.
 */
export function siteHost(host: string, baseDomain: string, platformHosts: string[]): { kind: "subdomain"; slug: string } | { kind: "domain"; hostname: string } | null {
  const h = host.toLowerCase().replace(/:\d+$/, "");
  if (isPlatformHost(h, platformHosts)) return null;
  if (h.endsWith(`.${baseDomain}`)) {
    const slug = h.slice(0, -(baseDomain.length + 1));
    if (slug === "www") return null;
    if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return { kind: "subdomain", slug };
    // Deeper names under the base (www.mijnbureau.localhost) are treated as connected domains, so the
    // domain flow can be tried locally; in production nobody else controls names under the sites domain.
    return normalizeHostname(h) ? { kind: "domain", hostname: h } : null;
  }
  return normalizeHostname(h) ? { kind: "domain", hostname: h } : null;
}

/** A starter home page for a new site, filled with the agency's name. */
export function starterHome(agency: string, city: string | null): SitePageContent {
  const id = (n: string) => `${n}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    nl: {
      title: "Home",
      seoTitle: `${agency}${city ? ` · DJ en entertainment in ${city}` : ""}`,
      seoDescription: `${agency} verzorgt muziek en entertainment voor bruiloften, bedrijfsfeesten en verjaardagen. Vraag vrijblijvend een offerte aan.`,
      sections: [
        { id: id("hero"), type: "hero", background: "brand", title: `Muziek die van elk feest een avond maakt om nooit te vergeten`, subtitle: `${agency}: dj's en live-acts voor bruiloften, bedrijfsfeesten en verjaardagen${city ? ` in en rond ${city}` : ""}.`, image: "", align: "center", ctaLabel: "Vraag een offerte aan", ctaTarget: "booking", ctaUrl: "" },
        {
          id: id("highlights"),
          type: "highlights",
          background: "default",
          heading: "Waarom kiezen voor ons",
          items: [
            { icon: "music", title: "Muziek op maat", body: "We stemmen de muziek af op jullie wensen en lezen de zaal." },
            { icon: "star", title: "Ervaren artiesten", body: "Professionele dj's en muzikanten met honderden feesten op hun naam." },
            { icon: "shield", title: "Zorgeloos geregeld", body: "Heldere offerte, vaste afspraken en alles goed voorbereid." },
          ],
        },
        { id: id("artists"), type: "artists", background: "muted", heading: "Onze artiesten", intro: "", max: 6 },
        { id: id("reviews"), type: "reviews", background: "default", heading: "Wat klanten zeggen", max: 3 },
        { id: id("booking"), type: "booking", background: "muted", heading: "Vraag een offerte aan", intro: "Vertel ons over je feest; je hoort snel van ons." },
      ],
    },
    en: null,
  };
}
