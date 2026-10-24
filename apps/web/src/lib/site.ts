import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { parseLimits } from "@stagedesk/core";
import { activePlans, footerColumns, getSetting, placedPages, publishedPageBySlug } from "@stagedesk/db";

/**
 * What the public website reads, cached and tagged. Admin actions call
 * updateTag() with the same tag, so a publish shows up on the next request.
 */
export const SITE_TAGS = { pages: "site-pages", plans: "site-plans", settings: "site-settings", footer: "site-footer" } as const;

export async function sitePages() {
  "use cache";
  cacheTag(SITE_TAGS.pages);
  cacheLife("hours");
  return placedPages();
}

export async function sitePage(slug: string) {
  "use cache";
  cacheTag(SITE_TAGS.pages);
  cacheLife("hours");
  return publishedPageBySlug(slug);
}

export async function sitePlans() {
  "use cache";
  cacheTag(SITE_TAGS.plans);
  cacheLife("hours");
  const plans = await activePlans();
  return plans
    .filter((p) => p.visible)
    .map((p) => ({
      id: p.id,
      key: p.key,
      name: p.name as Record<string, string>,
      description: (p.description ?? {}) as Record<string, string>,
      features: (p.features ?? {}) as Record<string, string[]>,
      monthlyPriceCents: p.monthlyPriceCents,
      yearlyPriceCents: p.yearlyPriceCents,
      trialDays: p.trialEnabled ? p.trialDays : 0,
      recommended: p.recommended,
      limits: parseLimits(p.limits),
      feeRule: p.feeRule,
    }));
}

export async function siteSettings() {
  "use cache";
  cacheTag(SITE_TAGS.settings);
  cacheLife("hours");
  const [site, fees, program] = await Promise.all([getSetting("site.general"), getSetting("fees.platform"), getSetting("affiliates.program")]);
  return { site, fees, program };
}

/** Footer columns with their links, plus the footer settings; changes call updateTag(SITE_TAGS.footer). */
export async function siteFooter() {
  "use cache";
  cacheTag(SITE_TAGS.footer);
  cacheTag(SITE_TAGS.pages);
  cacheLife("hours");
  const [columns, settings] = await Promise.all([footerColumns(), getSetting("site.footer")]);
  return { columns, settings };
}
