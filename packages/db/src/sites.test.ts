import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./client";
import {
  addAgencyDomain,
  createSitePage,
  deleteSitePage,
  ensureSite,
  isServedDomain,
  publishSite,
  recordDomainCheck,
  resolveSite,
  saveSitePageDraft,
  setSiteLive,
  siteEditorData,
  SiteError,
} from "./sites";

const run = `st${Date.now().toString(36)}`;
const org = `${run}-org`;

beforeAll(async () => {
  await prisma.organization.create({ data: { id: org, name: "Site Agency", slug: run, city: "Utrecht", brandColor: "#123456" } });
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: org } });
});

describe("agency sites", () => {
  it("starts with a home page in the agency's colour, offline until published", async () => {
    await ensureSite(org);
    await ensureSite(org);
    const { site, pages } = await siteEditorData(org);
    expect(site.theme.primary).toBe("#123456");
    expect(pages.map((p) => p.slug)).toEqual([""]);
    expect(pages[0]!.draft.nl.sections[0]!.type).toBe("hero");
    expect(await resolveSite({ kind: "subdomain", slug: run })).toBeNull();
  });

  it("only shows drafts after publishing, and can be taken offline", async () => {
    const { pages } = await siteEditorData(org);
    const home = pages[0]!;
    await publishSite(org);
    const live = await resolveSite({ kind: "subdomain", slug: run });
    expect(live?.pages[0]?.content.nl.sections[0]?.type).toBe("hero");

    await saveSitePageDraft(org, home.id, { nl: { title: "Home", sections: [{ id: "t1", type: "text", body: "Nieuw" }] }, en: null });
    expect((await resolveSite({ kind: "subdomain", slug: run }))?.pages[0]?.content.nl.sections[0]?.type).toBe("hero");
    await publishSite(org);
    expect((await resolveSite({ kind: "subdomain", slug: run }))?.pages[0]?.content.nl.sections[0]?.type).toBe("text");

    await setSiteLive(org, false);
    expect(await resolveSite({ kind: "subdomain", slug: run })).toBeNull();
    await setSiteLive(org, true);
    await prisma.organization.update({ where: { id: org }, data: { suspendedAt: new Date() } });
    expect(await resolveSite({ kind: "subdomain", slug: run })).toBeNull();
    await prisma.organization.update({ where: { id: org }, data: { suspendedAt: null } });
  });

  it("rejects unsafe content and keeps page rules", async () => {
    const { pages } = await siteEditorData(org);
    await expect(saveSitePageDraft(org, pages[0]!.id, { nl: { title: "X", sections: [{ id: "h", type: "hero", title: "Hi", ctaTarget: "url", ctaUrl: "javascript:x" }] } })).rejects.toMatchObject({ code: "invalid_content" });
    await expect(createSitePage(org, { slug: "en", title: "English" })).rejects.toMatchObject({ code: "invalid_slug" });
    const id = await createSitePage(org, { slug: "over-ons", title: "Over ons" });
    await expect(createSitePage(org, { slug: "over-ons", title: "Again" })).rejects.toMatchObject({ code: "slug_taken" });
    await expect(deleteSitePage(org, pages[0]!.id)).rejects.toMatchObject({ code: "home_required" });
    await deleteSitePage(org, id);
  });

  it("serves a custom domain only after it's verified", async () => {
    const domain = await addAgencyDomain(org, `https://www.${run}.nl/`);
    expect(domain.hostname).toBe(`www.${run}.nl`);
    await expect(addAgencyDomain(org, `www.${run}.nl`)).rejects.toBeInstanceOf(SiteError);
    expect(await resolveSite({ kind: "domain", hostname: domain.hostname })).toBeNull();
    expect(await isServedDomain(domain.hostname)).toBe(false);

    await recordDomainCheck(org, domain.id, { ok: false, error: "TXT record not found" });
    expect((await prisma.agencyDomain.findUniqueOrThrow({ where: { id: domain.id } })).status).toBe("failed");
    await recordDomainCheck(org, domain.id, { ok: true });
    expect(await isServedDomain(domain.hostname)).toBe(true);
    expect((await resolveSite({ kind: "domain", hostname: domain.hostname }))?.organization.id).toBe(org);
  });
});
