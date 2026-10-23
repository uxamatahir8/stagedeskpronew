import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PageContent } from "@stagedesk/core";
import { prisma } from "./client";
import { acceptLegal, PageError, pendingLegal, publishPageVersion, publishedPageBySlug, restorePageVersion, savePageDraft } from "./pages";

const run = `p${Date.now().toString(36)}`;
const admin = `${run}-admin`;
const owner = `${run}-owner`;
const customer = `${run}-cust`;
const org = `${run}-org`;

const content = (title: string, text: string): PageContent => ({
  nl: { title, seoTitle: "", seoDescription: "", blocks: [{ type: "paragraph", text }] },
  en: { title: `${title} (en)`, seoTitle: "", seoDescription: "", blocks: [{ type: "paragraph", text }] },
});
const meta = (slug: string, acceptance: "none" | "all" | "agencies" = "none") => ({
  slugNl: `${slug}-nl`,
  slugEn: `${slug}-en`,
  kind: acceptance === "none" ? ("standard" as const) : ("legal" as const),
  legalKey: null,
  acceptance,
  placement: "footer_legal",
  position: 0,
});

beforeAll(async () => {
  await prisma.user.createMany({
    data: [
      { id: admin, name: "Admin", email: `${run}-a@test.local` },
      { id: owner, name: "Owner", email: `${run}-o@test.local` },
      { id: customer, name: "Customer", email: `${run}-c@test.local` },
    ],
  });
  await prisma.organization.create({ data: { id: org, name: "Legal Agency", slug: org } });
  await prisma.member.createMany({
    data: [
      { id: randomUUID(), organizationId: org, userId: owner, role: "agency_owner" },
      { id: randomUUID(), organizationId: org, userId: customer, role: "customer" },
    ],
  });
});

afterAll(async () => {
  const pages = await prisma.page.findMany({ where: { slugNl: { startsWith: run } }, select: { id: true } });
  const ids = pages.map((p) => p.id);
  await prisma.legalAcceptance.deleteMany({ where: { pageId: { in: ids } } });
  await prisma.page.updateMany({ where: { id: { in: ids } }, data: { publishedVersionId: null } });
  await prisma.page.deleteMany({ where: { id: { in: ids } } });
  await prisma.member.deleteMany({ where: { organizationId: org } });
  await prisma.organization.delete({ where: { id: org } });
  await prisma.user.deleteMany({ where: { id: { in: [admin, owner, customer] } } });
});

describe("page versions", () => {
  it("keeps every save as a version and only shows the published one", async () => {
    const first = await savePageDraft({ pageId: null, meta: meta(`${run}-about`), content: content("Over ons", "Eerste tekst"), note: null, actorId: admin });
    expect(first.version.number).toBe(1);
    expect(await publishedPageBySlug(`${run}-about-nl`)).toBeNull();

    await publishPageVersion(first.page.id, first.version.id);
    const second = await savePageDraft({ pageId: first.page.id, meta: meta(`${run}-about`), content: content("Over ons", "Tweede tekst"), note: "Nieuwe tekst", actorId: admin });
    expect(second.version.number).toBe(2);

    // The draft isn't live yet; the English slug finds the same page.
    const live = await publishedPageBySlug(`${run}-about-en`);
    expect(live?.content.nl.blocks[0]).toEqual({ type: "paragraph", text: "Eerste tekst" });

    const restored = await restorePageVersion(first.page.id, first.version.id, admin);
    expect(restored.number).toBe(3);
    expect(restored.note).toBe("Restored from version 1");
    expect(await prisma.pageVersion.count({ where: { pageId: first.page.id } })).toBe(3);
  });

  it("refuses an address another page uses, and invalid content", async () => {
    await expect(savePageDraft({ pageId: null, meta: meta(`${run}-about`), content: content("Dubbel", "x"), note: null, actorId: admin })).rejects.toBeInstanceOf(PageError);
    const bad = { ...content("", "x") };
    await expect(savePageDraft({ pageId: null, meta: meta(`${run}-empty`), content: bad, note: null, actorId: admin })).rejects.toMatchObject({ code: "invalid_content" });
  });
});

describe("legal acceptance", () => {
  it("asks everyone for new Terms, agency teams for the DPA, and each version only once", async () => {
    const terms = await savePageDraft({ pageId: null, meta: meta(`${run}-terms`, "all"), content: content("Voorwaarden", "v1"), note: null, actorId: admin });
    const dpa = await savePageDraft({ pageId: null, meta: meta(`${run}-dpa`, "agencies"), content: content("Verwerkersovereenkomst", "v1"), note: null, actorId: admin });
    await publishPageVersion(terms.page.id, terms.version.id);
    await publishPageVersion(dpa.page.id, dpa.version.id);

    const ours = (list: { id: string }[]) => list.filter((p) => [terms.page.id, dpa.page.id].includes(p.id)).map((p) => p.id);
    expect(ours(await pendingLegal(customer))).toEqual([terms.page.id]);
    expect(ours(await pendingLegal(owner)).sort()).toEqual([terms.page.id, dpa.page.id].sort());

    await acceptLegal(owner, [terms.version.id, dpa.version.id], "127.0.0.1");
    await acceptLegal(owner, [terms.version.id], "127.0.0.1");
    expect(ours(await pendingLegal(owner))).toEqual([]);
    expect(await prisma.legalAcceptance.count({ where: { userId: owner, pageId: terms.page.id } })).toBe(1);

    // A new published version of the Terms is asked for again.
    const v2 = await savePageDraft({ pageId: terms.page.id, meta: meta(`${run}-terms`, "all"), content: content("Voorwaarden", "v2"), note: null, actorId: admin });
    expect(ours(await pendingLegal(owner))).toEqual([]);
    await publishPageVersion(terms.page.id, v2.version.id);
    expect(ours(await pendingLegal(owner))).toEqual([terms.page.id]);

    // Accepting a version that isn't live does nothing.
    expect(await acceptLegal(owner, [terms.version.id], null)).toBe(0);
  });
});
