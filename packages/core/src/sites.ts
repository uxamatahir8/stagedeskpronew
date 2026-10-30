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
/** Where a button or card may point: a web address, a page or anchor on the site, email or phone. */
const link = z
  .string()
  .trim()
  .max(500)
  .refine((u) => u === "" || /^(https?:\/\/[^\s"'<>]+|\/[^\s"'<>]*|#[\w-]+|mailto:[^\s"'<>]+|tel:[+\d\s()-]+)$/.test(u), "unsafe url");

/** Built-in icons agencies can pick; names, not markup (the site maps them to its icon set). */
export const siteIcons = [
  "music", "heart", "star", "sparkles", "calendar", "shield", "users", "mic", "headphones", "disc", "speaker", "guitar", "piano", "drum", "radio", "volume",
  "party", "cake", "gift", "wine", "martini", "beer", "utensils", "ticket", "camera", "video", "lightbulb", "zap", "flame", "crown", "award", "trophy",
  "gem", "badge", "thumbsUp", "smile", "handHeart", "clock", "calendarCheck", "mapPin", "phone", "mail", "message", "check", "rocket", "globe",
  "car", "truck", "plane", "home", "building", "church", "tent", "briefcase", "leaf", "sun", "moon", "waves", "wand", "baby",
] as const;
export type SiteIcon = (typeof siteIcons)[number];
/** The icons highlights started with; kept for older content. */
export const highlightIcons = ["music", "heart", "star", "sparkles", "calendar", "shield", "users", "mic"] as const satisfies readonly SiteIcon[];

const emoji = /^(\p{Extended_Pictographic}|\p{Regional_Indicator})(\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|️|‍|⃣)*$/u;
/** What an icon value is: a built-in icon, an emoji, or an uploaded image ("" = none); null if it's none of these. */
export function iconKind(value: string): "none" | "builtin" | "emoji" | "image" | null {
  if (value === "") return "none";
  if ((siteIcons as readonly string[]).includes(value)) return "builtin";
  if (value.length <= 16 && emoji.test(value)) return "emoji";
  if (isSafeImageUrl(value)) return "image";
  return null;
}
const icon = z.string().trim().max(500).refine((v) => iconKind(v) !== null, "invalid icon");

export const sectionBackgrounds = ["default", "muted", "brand", "accent", "dark", "gradient", "image"] as const;
export const sectionSpacings = ["compact", "normal", "large"] as const;
export const ctaTargets = ["booking", "contact", "url"] as const;

const base = {
  id: z.string().min(1).max(64),
  background: z.enum(sectionBackgrounds).default("default"),
  // Optional style choices: left out, the theme decides.
  backgroundImage: image.optional(),
  spacing: z.enum(sectionSpacings).optional(),
  headingAlign: z.enum(["center", "left"]).optional(),
};
const cta = {
  ctaLabel: text(60).default(""),
  ctaTarget: z.enum(ctaTargets).default("booking"),
  ctaUrl: link.default(""),
};
const heading = text(160).default("");
const intro = text(400).default("");

export const sectionSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("hero"), title: text(160).min(1), subtitle: text(400).default(""), image: image.default(""), align: z.enum(["left", "center"]).default("center"), ...cta }),
  z.object({ ...base, type: z.literal("text"), heading, body: text(8000).min(1) }),
  z.object({
    ...base,
    type: z.literal("highlights"),
    heading,
    items: z.array(z.object({ icon: icon.default("star"), title: text(80).min(1), body: text(400).default("") })).min(1).max(6),
  }),
  z.object({ ...base, type: z.literal("artists"), heading, intro, max: z.int().min(1).max(24).default(6) }),
  z.object({ ...base, type: z.literal("packages"), heading, intro, showPrices: z.boolean().default(true) }),
  z.object({ ...base, type: z.literal("reviews"), heading, max: z.int().min(1).max(12).default(3) }),
  z.object({
    ...base,
    type: z.literal("gallery"),
    heading,
    images: z.array(z.object({ url: image.refine((u) => u !== "", "required"), alt: text(200).default("") })).min(1).max(24),
  }),
  z.object({ ...base, type: z.literal("video"), heading, url: z.string().trim().max(500).default("") }),
  z.object({ ...base, type: z.literal("faq"), heading, items: z.array(z.object({ q: text(200).min(1), a: text(2000).min(1) })).min(1).max(20) }),
  z.object({ ...base, type: z.literal("cta"), heading: text(160).min(1), body: text(400).default(""), ...cta }),
  z.object({ ...base, type: z.literal("booking"), heading, intro }),
  z.object({ ...base, type: z.literal("contact"), heading, intro }),
  // Pre-built blocks filled with the agency's own content.
  z.object({
    ...base,
    type: z.literal("cards"),
    heading,
    intro,
    layout: z.enum(["grid", "list", "overlay", "centered"]).default("grid"),
    columns: z.int().min(2).max(4).default(3),
    items: z
      .array(z.object({ icon: icon.default(""), image: image.default(""), title: text(120).min(1), body: text(600).default(""), linkLabel: text(60).default(""), linkUrl: link.default("") }))
      .min(1)
      .max(12),
  }),
  z.object({ ...base, type: z.literal("stats"), heading, items: z.array(z.object({ value: text(24).min(1), label: text(80).default(""), icon: icon.default("") })).min(1).max(6) }),
  z.object({
    ...base,
    type: z.literal("steps"),
    heading,
    intro,
    layout: z.enum(["horizontal", "vertical"]).default("horizontal"),
    items: z.array(z.object({ title: text(120).min(1), body: text(400).default(""), icon: icon.default("") })).min(1).max(8),
  }),
  z.object({
    ...base,
    type: z.literal("split"),
    heading,
    body: text(4000).default(""),
    image: image.default(""),
    imageSide: z.enum(["left", "right"]).default("right"),
    items: z.array(z.object({ text: text(160).min(1) })).max(8).default([]),
    ...cta,
  }),
  z.object({
    ...base,
    type: z.literal("testimonials"),
    heading,
    layout: z.enum(["grid", "spotlight"]).default("grid"),
    items: z
      .array(z.object({ quote: text(800).min(1), author: text(80).default(""), role: text(80).default(""), image: image.default(""), rating: z.int().min(0).max(5).default(5) }))
      .min(1)
      .max(12),
  }),
  z.object({
    ...base,
    type: z.literal("pricing"),
    heading,
    intro,
    items: z
      .array(
        z.object({
          name: text(80).min(1),
          price: text(24).default(""),
          period: text(40).default(""),
          description: text(300).default(""),
          /** One feature per line. */
          features: text(1200).default(""),
          highlighted: z.boolean().default(false),
          badge: text(30).default(""),
          ctaLabel: text(40).default(""),
        }),
      )
      .min(1)
      .max(4),
    ...cta,
  }),
  z.object({
    ...base,
    type: z.literal("logos"),
    heading,
    grayscale: z.boolean().default(true),
    images: z.array(z.object({ url: image.refine((u) => u !== "", "required"), alt: text(200).default("") })).min(1).max(24),
  }),
  z.object({ ...base, type: z.literal("team"), heading, intro, items: z.array(z.object({ image: image.default(""), name: text(80).min(1), role: text(80).default(""), bio: text(400).default("") })).min(1).max(12) }),
  z.object({ ...base, type: z.literal("banner"), text: text(200).min(1), icon: icon.default("sparkles"), ...cta }),
  z.object({ ...base, type: z.literal("divider"), style: z.enum(["line", "dots", "wave", "space"]).default("line") }),
]);
export type Section = z.infer<typeof sectionSchema>;
export type SectionType = Section["type"];
export const sectionTypes = [
  "hero", "text", "highlights", "cards", "split", "stats", "steps", "artists", "packages", "pricing", "reviews", "testimonials",
  "gallery", "video", "logos", "team", "faq", "banner", "cta", "booking", "contact", "divider",
] as const satisfies readonly SectionType[];

/** How the add-section gallery groups the blocks. */
export const sectionGroups = {
  intro: ["hero", "banner", "text", "split"],
  blocks: ["highlights", "cards", "stats", "steps", "team", "logos", "divider"],
  live: ["artists", "packages", "reviews"],
  sell: ["pricing", "testimonials", "gallery", "video", "faq"],
  convert: ["cta", "booking", "contact"],
} as const satisfies Record<string, readonly SectionType[]>;

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

export const siteFonts = ["modern", "classic", "rounded", "bold", "elegant", "geometric", "condensed", "playful"] as const;
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const siteThemeSchema = z.object({
  primary: hex,
  accent: hex,
  font: z.enum(siteFonts),
  radius: z.enum(["sharp", "soft", "round"]),
  /** Dark header, or light. */
  mode: z.enum(["light", "dark"]),
  // Added later; older themes get these defaults.
  headingFont: z.enum(["same", ...siteFonts]).default("same"),
  /** The page itself: white, a soft tint of the main colour, or dark. */
  page: z.enum(["light", "tinted", "dark"]).default("light"),
  buttons: z.enum(["solid", "outline", "pill", "soft"]).default("solid"),
  cards: z.enum(["flat", "outlined", "elevated", "glass"]).default("outlined"),
  spacing: z.enum(["compact", "normal", "airy"]).default("normal"),
  headerLayout: z.enum(["classic", "centered"]).default("classic"),
});
export type SiteTheme = z.infer<typeof siteThemeSchema>;
export const defaultSiteTheme: SiteTheme = siteThemeSchema.parse({ primary: "#572261", accent: "#d6337f", font: "modern", radius: "soft", mode: "light" });

/** Ready-made looks; picking one fills in every theme setting, which all stay editable. */
export const sitePresets = [
  { id: "stagedesk", theme: defaultSiteTheme },
  { id: "midnight", theme: { primary: "#0f172a", accent: "#38bdf8", font: "geometric", radius: "round", mode: "dark", headingFont: "same", page: "dark", buttons: "pill", cards: "glass", spacing: "airy", headerLayout: "classic" } },
  { id: "blush", theme: { primary: "#831843", accent: "#ec4899", font: "modern", radius: "round", mode: "light", headingFont: "elegant", page: "tinted", buttons: "pill", cards: "flat", spacing: "airy", headerLayout: "centered" } },
  { id: "gold", theme: { primary: "#1c1917", accent: "#c8a03c", font: "classic", radius: "sharp", mode: "dark", headingFont: "same", page: "dark", buttons: "outline", cards: "outlined", spacing: "airy", headerLayout: "centered" } },
  { id: "festival", theme: { primary: "#5b21b6", accent: "#f97316", font: "geometric", radius: "round", mode: "dark", headingFont: "condensed", page: "light", buttons: "pill", cards: "elevated", spacing: "normal", headerLayout: "classic" } },
  { id: "minimal", theme: { primary: "#171717", accent: "#171717", font: "modern", radius: "sharp", mode: "light", headingFont: "same", page: "light", buttons: "outline", cards: "outlined", spacing: "airy", headerLayout: "classic" } },
  { id: "forest", theme: { primary: "#14532d", accent: "#65a30d", font: "rounded", radius: "round", mode: "light", headingFont: "same", page: "tinted", buttons: "soft", cards: "flat", spacing: "normal", headerLayout: "classic" } },
  { id: "neon", theme: { primary: "#09090b", accent: "#a3e635", font: "geometric", radius: "soft", mode: "dark", headingFont: "condensed", page: "dark", buttons: "solid", cards: "glass", spacing: "normal", headerLayout: "classic" } },
] as const satisfies readonly { id: string; theme: SiteTheme }[];
export type SitePresetId = (typeof sitePresets)[number]["id"];

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
        {
          id: id("steps"),
          type: "steps",
          background: "default",
          heading: "Zo werkt het",
          intro: "",
          layout: "horizontal",
          items: [
            { title: "Vertel over je feest", body: "Vul het aanvraagformulier in; het kost een paar minuten.", icon: "" },
            { title: "Ontvang een offerte", body: "Op maat en zonder verplichtingen.", icon: "" },
            { title: "Feest!", body: "Wij zorgen voor muziek, geluid en sfeer.", icon: "" },
          ],
        },
        { id: id("booking"), type: "booking", background: "muted", heading: "Vraag een offerte aan", intro: "Vertel ons over je feest; je hoort snel van ons." },
      ],
    },
    en: null,
  };
}
