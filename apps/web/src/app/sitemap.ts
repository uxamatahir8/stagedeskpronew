import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { prisma } from "@stagedesk/db";
import { posts } from "@/content/blog";
import { articles } from "@/content/help";
import { siteUrl } from "@/lib/seo";

type Entry = MetadataRoute.Sitemap[number];

/** Both languages of a page, each pointing at the other (hreflang). */
function both(paths: { nl: string; en: string }, extra: Partial<Entry> = {}): Entry[] {
  const languages = { nl: siteUrl("nl", paths.nl), en: siteUrl("en", paths.en) };
  return [
    { url: languages.nl, alternates: { languages }, ...extra },
    { url: languages.en, alternates: { languages }, ...extra },
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const fixed = [
    "/", "/features", "/pricing", "/about", "/for-agencies", "/for-artists", "/partners", "/blog", "/help", "/changelog", "/contact",
    "/features/booking-page", "/features/quotes-invoices", "/features/payments-payouts", "/features/artist-management",
    "/solutions/weddings-events", "/solutions/band-agencies", "/request", "/tour",
  ];
  const [pages, agencies] = await Promise.all([
    prisma.page.findMany({ where: { status: "published" }, select: { slugNl: true, slugEn: true, updatedAt: true } }),
    // Public booking pages that are switched on.
    prisma.organization.findMany({ where: { bookingPageEnabled: true, suspendedAt: null }, select: { slug: true } }),
  ]);
  return [
    ...fixed.flatMap((p) => both({ nl: p, en: p }, { changeFrequency: "weekly", priority: p === "/" ? 1 : 0.8 })),
    ...posts.flatMap((p) => both({ nl: `/blog/${p.slug}`, en: `/blog/${p.slug}` }, { lastModified: p.date, changeFrequency: "monthly" })),
    ...articles.flatMap((a) => both({ nl: `/help/${a.slug}`, en: `/help/${a.slug}` }, { changeFrequency: "monthly" })),
    ...pages.flatMap((p) => both({ nl: `/${p.slugNl}`, en: `/${p.slugEn}` }, { lastModified: p.updatedAt, changeFrequency: "yearly", priority: 0.3 })),
    ...agencies.flatMap((a) => both({ nl: `/b/${a.slug}`, en: `/b/${a.slug}` }, { changeFrequency: "weekly", priority: 0.6 })),
  ];
}
