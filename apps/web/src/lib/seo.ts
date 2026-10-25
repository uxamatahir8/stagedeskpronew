import { localePrefix } from "@stagedesk/core";
import "server-only";
import type { Metadata } from "next";
import { appUrl } from "./mail";

type Locale = "nl" | "en";

/** Absolute URL of a public path in a language (English without prefix, Dutch under /nl). */
export function siteUrl(locale: Locale, path: string) {
  const clean = path === "/" ? "" : path;
  return `${appUrl}${localePrefix(locale)}${clean}` || appUrl;
}

/**
 * Metadata for a public page: title and description, canonical URL,
 * hreflang links to both languages, and an Open Graph / Twitter card with a
 * generated image. Paths may differ per language (builder pages have their
 * own slug in each).
 */
export function pageMetadata(input: {
  locale: Locale;
  title: string;
  description: string;
  paths: { nl: string; en: string };
  kicker?: string;
  type?: "website" | "article";
  publishedTime?: string;
  modifiedTime?: string;
  /** A page image (path or URL) instead of the generated card, e.g. a blog cover. */
  image?: string | null;
  noIndex?: boolean;
}): Metadata {
  const url = siteUrl(input.locale, input.paths[input.locale]);
  const image = input.image ? (input.image.startsWith("/") ? `${appUrl}${input.image}` : input.image) : `${appUrl}/api/og?${new URLSearchParams({ title: input.title, ...(input.kicker ? { kicker: input.kicker } : {}) })}`;
  return {
    title: input.title,
    description: input.description,
    alternates: {
      canonical: url,
      languages: { nl: siteUrl("nl", input.paths.nl), en: siteUrl("en", input.paths.en), "x-default": siteUrl("nl", input.paths.nl) },
    },
    openGraph: {
      type: input.type ?? "website",
      url,
      siteName: "StageDesk",
      title: input.title,
      description: input.description,
      locale: input.locale === "en" ? "en_GB" : "nl_NL",
      images: [{ url: image, ...(input.image ? {} : { width: 1200, height: 630 }), alt: input.title }],
      ...(input.publishedTime ? { publishedTime: input.publishedTime } : {}),
      ...(input.modifiedTime ? { modifiedTime: input.modifiedTime } : {}),
    },
    twitter: { card: "summary_large_image", title: input.title, description: input.description, images: [image] },
    ...(input.noIndex ? { robots: { index: false, follow: true } } : {}),
  };
}

/** A JSON-LD script; `<` is escaped so content can never close the tag. */
export function jsonLd(data: Record<string, unknown>) {
  return { __html: JSON.stringify({ "@context": "https://schema.org", ...data }).replace(/</g, "\\u003c") };
}
