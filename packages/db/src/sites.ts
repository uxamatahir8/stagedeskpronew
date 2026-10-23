import { randomBytes, randomUUID } from "node:crypto";
import {
  defaultSiteTheme,
  normalizeHostname,
  parseSiteTheme,
  reservedSiteSlugs,
  sitePageContentSchema,
  sitePageSlug,
  siteThemeSchema,
  starterHome,
  type SitePageContent,
  type SiteTheme,
} from "@stagedesk/core";
import { prisma } from "./client";
import { tenantDb } from "./tenant";

export class SiteError extends Error {
  constructor(readonly code: "not_found" | "slug_taken" | "invalid_slug" | "invalid_content" | "home_required" | "domain_taken" | "invalid_domain" | "domain_limit") {
    super(`Site: ${code}`);
    this.name = "SiteError";
  }
}

/** The agency's site, created on first use with a starter home page in the agency's colour. */
export async function ensureSite(organizationId: string) {
  const db = tenantDb(organizationId);
  const existing = await db.agencySite.findFirst({});
  if (existing) return existing;
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, city: true, brandColor: true } });
  const theme: SiteTheme = { ...defaultSiteTheme, ...(org.brandColor && /^#[0-9a-fA-F]{6}$/.test(org.brandColor) ? { primary: org.brandColor } : {}) };
  await prisma.$transaction([
    prisma.agencySite.create({ data: { organizationId, theme } }),
    prisma.agencySitePage.create({ data: { id: randomUUID(), organizationId, slug: "", position: 0, inNav: true, draft: starterHome(org.name, org.city) } }),
  ]);
  return db.agencySite.findFirstOrThrow({});
}

export async function siteEditorData(organizationId: string) {
  const site = await ensureSite(organizationId);
  const pages = await tenantDb(organizationId).agencySitePage.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  return { site: { ...site, theme: parseSiteTheme(site.theme) }, pages: pages.map((p) => ({ ...p, draft: p.draft as SitePageContent, changed: JSON.stringify(p.draft) !== JSON.stringify(p.published) })) };
}

/** Saves the draft of one page; the live site only changes on publish. */
export async function saveSitePageDraft(organizationId: string, pageId: string, content: unknown) {
  const parsed = sitePageContentSchema.safeParse(content);
  if (!parsed.success) throw new SiteError("invalid_content");
  const saved = await tenantDb(organizationId).agencySitePage.updateMany({ where: { id: pageId }, data: { draft: parsed.data } });
  if (saved.count === 0) throw new SiteError("not_found");
  return parsed.data;
}

function checkSlug(slug: string) {
  const parsed = sitePageSlug.safeParse(slug);
  if (!parsed.success || parsed.data === "" || reservedSiteSlugs.includes(parsed.data)) throw new SiteError("invalid_slug");
  return parsed.data;
}

export async function createSitePage(organizationId: string, input: { slug: string; title: string }) {
  const slug = checkSlug(input.slug);
  const db = tenantDb(organizationId);
  if (await db.agencySitePage.findFirst({ where: { slug } })) throw new SiteError("slug_taken");
  const last = await db.agencySitePage.findFirst({ orderBy: { position: "desc" }, select: { position: true } });
  const id = randomUUID();
  const title = input.title.trim().slice(0, 120) || slug;
  await db.agencySitePage.create({
    data: {
      id,
      organizationId,
      slug,
      position: (last?.position ?? 0) + 1,
      draft: { nl: { title, seoTitle: "", seoDescription: "", sections: [{ id: `text-${randomUUID().slice(0, 6)}`, type: "text", background: "default", heading: title, body: "Vertel hier meer over je bureau." }] }, en: null },
    },
  });
  return id;
}

export async function updateSitePageSettings(organizationId: string, pageId: string, input: { slug?: string; inNav?: boolean }) {
  const db = tenantDb(organizationId);
  const page = await db.agencySitePage.findFirst({ where: { id: pageId } });
  if (!page) throw new SiteError("not_found");
  let slug = page.slug;
  if (input.slug !== undefined && page.slug !== "") {
    slug = checkSlug(input.slug);
    if (slug !== page.slug && (await db.agencySitePage.findFirst({ where: { slug } }))) throw new SiteError("slug_taken");
  }
  await db.agencySitePage.updateMany({ where: { id: pageId }, data: { slug, inNav: input.inNav ?? page.inNav } });
}

export async function deleteSitePage(organizationId: string, pageId: string) {
  const db = tenantDb(organizationId);
  const page = await db.agencySitePage.findFirst({ where: { id: pageId }, select: { slug: true } });
  if (!page) throw new SiteError("not_found");
  if (page.slug === "") throw new SiteError("home_required");
  await db.agencySitePage.deleteMany({ where: { id: pageId } });
}

/** New order of pages in the menu (the home page stays first). */
export async function reorderSitePages(organizationId: string, pageIds: string[]) {
  const db = tenantDb(organizationId);
  const pages = await db.agencySitePage.findMany({ select: { id: true, slug: true } });
  const home = pages.find((p) => p.slug === "");
  const order = [home?.id, ...pageIds.filter((id) => id !== home?.id && pages.some((p) => p.id === id))].filter(Boolean) as string[];
  await prisma.$transaction(order.map((id, position) => prisma.agencySitePage.updateMany({ where: { id, organizationId }, data: { position } })));
}

export async function saveSiteTheme(organizationId: string, input: { theme: unknown; englishEnabled: boolean }) {
  const theme = siteThemeSchema.safeParse(input.theme);
  if (!theme.success) throw new SiteError("invalid_content");
  await ensureSite(organizationId);
  await tenantDb(organizationId).agencySite.updateMany({ where: {}, data: { theme: theme.data, englishEnabled: input.englishEnabled } });
}

/** Makes every draft live and the site visible. */
export async function publishSite(organizationId: string, now = new Date()) {
  const site = await ensureSite(organizationId);
  const pages = await tenantDb(organizationId).agencySitePage.findMany({ select: { id: true, draft: true } });
  await prisma.$transaction([
    ...pages.map((p) => prisma.agencySitePage.update({ where: { id: p.id }, data: { published: p.draft ?? undefined, publishedAt: now } })),
    prisma.agencySite.update({ where: { organizationId }, data: { publishedTheme: site.theme ?? undefined, publishedAt: now, live: true } }),
  ]);
}

/** Takes the site offline (or back online) without touching its content. */
export async function setSiteLive(organizationId: string, live: boolean) {
  const site = await ensureSite(organizationId);
  if (live && !site.publishedAt) throw new SiteError("not_found");
  await prisma.agencySite.update({ where: { organizationId }, data: { live } });
}

/**
 * The live site for a request: a free subdomain (the agency's slug) or a
 * verified custom domain. Read across agencies on purpose: the host is the
 * only thing a visitor brings. Suspended agencies and offline sites resolve to nothing.
 */
export async function resolveSite(host: { kind: "subdomain"; slug: string } | { kind: "domain"; hostname: string }) {
  const organizationId =
    host.kind === "subdomain"
      ? (await prisma.organization.findUnique({ where: { slug: host.slug }, select: { id: true } }))?.id
      : (await prisma.agencyDomain.findUnique({ where: { hostname: host.hostname }, select: { organizationId: true, status: true } }).then((d) => (d?.status === "verified" ? d.organizationId : undefined)));
  if (!organizationId) return null;
  const [site, organization, pages] = await Promise.all([
    prisma.agencySite.findUnique({ where: { organizationId } }),
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, slug: true, logo: true, city: true, contactEmail: true, phone: true, website: true, addressLine: true, postalCode: true, suspendedAt: true, bookingPageEnabled: true },
    }),
    prisma.agencySitePage.findMany({ where: { organizationId, published: { not: undefined } }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { slug: true, inNav: true, published: true } }),
  ]);
  if (!site?.live || !site.publishedTheme || !organization || organization.suspendedAt) return null;
  return {
    organization,
    theme: parseSiteTheme(site.publishedTheme),
    englishEnabled: site.englishEnabled,
    pages: pages.filter((p) => p.published !== null).map((p) => ({ slug: p.slug, inNav: p.inNav, content: p.published as SitePageContent })),
  };
}
export type ResolvedSite = NonNullable<Awaited<ReturnType<typeof resolveSite>>>;

export async function agencyDomains(organizationId: string) {
  return tenantDb(organizationId).agencyDomain.findMany({ orderBy: { createdAt: "asc" } });
}

/** Adds a domain to connect; it is served once the TXT record checks out. */
export async function addAgencyDomain(organizationId: string, input: string, max = 3) {
  const hostname = normalizeHostname(input);
  if (!hostname) throw new SiteError("invalid_domain");
  if (await prisma.agencyDomain.findUnique({ where: { hostname }, select: { id: true } })) throw new SiteError("domain_taken");
  if ((await tenantDb(organizationId).agencyDomain.count()) >= max) throw new SiteError("domain_limit");
  return prisma.agencyDomain.create({ data: { id: randomUUID(), organizationId, hostname, token: `sd-${randomBytes(12).toString("hex")}` } });
}

/** Records the result of a DNS check (done by the caller, which can be faked in tests and local development). */
export async function recordDomainCheck(organizationId: string, domainId: string, result: { ok: true } | { ok: false; error: string }, now = new Date()) {
  const db = tenantDb(organizationId);
  const domain = await db.agencyDomain.findFirst({ where: { id: domainId } });
  if (!domain) throw new SiteError("not_found");
  await db.agencyDomain.updateMany({
    where: { id: domainId },
    data: result.ok
      ? { status: "verified", verifiedAt: domain.verifiedAt ?? now, lastCheckedAt: now, lastError: null }
      : { status: domain.status === "verified" ? "verified" : "failed", lastCheckedAt: now, lastError: result.error.slice(0, 191) },
  });
  return db.agencyDomain.findFirstOrThrow({ where: { id: domainId } });
}

export async function removeAgencyDomain(organizationId: string, domainId: string) {
  await tenantDb(organizationId).agencyDomain.deleteMany({ where: { id: domainId } });
}

/** For the TLS "ask" endpoint: only verified custom domains get a certificate. */
export async function isServedDomain(hostname: string) {
  return (await prisma.agencyDomain.count({ where: { hostname, status: "verified" } })) > 0;
}
