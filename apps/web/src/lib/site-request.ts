import "server-only";
import { siteHost } from "@stagedesk/core";
import { agencyBilling, resolveSite, type ResolvedSite } from "@stagedesk/db";
import { appUrl } from "./mail";

export const sitesBase = process.env.SITES_BASE_DOMAIN || "localhost";
const platformHost = new URL(appUrl).hostname;
const platformHosts = [platformHost, platformHost.replace(/^www\./, ""), `www.${platformHost.replace(/^www\./, "")}`];

/** The live site behind a hostname, or null. */
export async function siteForHost(host: string) {
  const info = siteHost(decodeURIComponent(host), sitesBase, platformHosts);
  return info ? resolveSite(info) : null;
}

/**
 * The page for a path on a site: "/en/…" is English when the site has it,
 * otherwise Dutch; "" is the home page. English falls back to Dutch per page.
 */
export function pageForPath(site: ResolvedSite, path: string[]) {
  const english = path[0] === "en" && site.englishEnabled;
  const rest = english ? path.slice(1) : path;
  if (rest.length > 1) return null;
  const slug = rest[0] ?? "";
  const page = site.pages.find((p) => p.slug === slug);
  if (!page) return null;
  const lang = english && page.content.en ? ("en" as const) : ("nl" as const);
  return { page, lang, content: page.content[lang] ?? page.content.nl };
}

/** Links on the site keep the visitor's language. */
export function siteHref(lang: "nl" | "en", slug: string) {
  const prefix = lang === "en" ? "/en" : "";
  if (!slug) return prefix || "/";
  return `${prefix}/${slug}`;
}

/** Whether the "Made with StageDesk" line is shown (plans with removeBranding hide it). */
export async function showBranding(organizationId: string) {
  const { limits } = await agencyBilling(organizationId);
  return !limits.removeBranding;
}

/** The public address of a site: the first verified domain, else the free subdomain. */
export function siteOrigin(host: string) {
  const protocol = appUrl.startsWith("https") ? "https" : "http";
  const port = sitesBase === "localhost" ? `:${new URL(appUrl).port || "3000"}` : "";
  return `${protocol}://${decodeURIComponent(host)}${port}`;
}

/** Where an agency's site lives: its first verified domain, otherwise the free subdomain. */
export function siteUrlFor(slug: string, verifiedDomain?: string | null) {
  return siteOrigin(verifiedDomain ?? `${slug}.${sitesBase}`);
}
