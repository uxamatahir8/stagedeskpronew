import { describe, expect, it } from "vitest";
import { blockSchema, blocksToLines, diffLines, isSafeHref, isValidSlug, pageContentSchema, parseInline, pendingAcceptances } from "./pages";

describe("page blocks", () => {
  it("accepts the six block types and refuses unsafe images", () => {
    expect(blockSchema.safeParse({ type: "heading", level: 2, text: "Over ons" }).success).toBe(true);
    expect(blockSchema.safeParse({ type: "image", url: "https://cdn.example.com/a.jpg", alt: "" }).success).toBe(true);
    expect(blockSchema.safeParse({ type: "image", url: "/files/public/a.png", alt: "" }).success).toBe(true);
    expect(blockSchema.safeParse({ type: "image", url: "javascript:alert(1)", alt: "" }).success).toBe(false);
    expect(blockSchema.safeParse({ type: "image", url: "http://insecure.example.com/a.jpg", alt: "" }).success).toBe(false);
    expect(blockSchema.safeParse({ type: "script", text: "x" }).success).toBe(false);
  });

  it("needs a title in both languages", () => {
    const en = { title: "About", blocks: [] };
    expect(pageContentSchema.safeParse({ nl: { title: "Over ons", blocks: [] }, en }).success).toBe(true);
    expect(pageContentSchema.safeParse({ nl: { title: " ", blocks: [] }, en }).success).toBe(false);
  });
});

describe("slugs and links", () => {
  it("allows lowercase words with dashes, never a path the app uses", () => {
    expect(isValidSlug("algemene-voorwaarden")).toBe(true);
    expect(isValidSlug("Over Ons")).toBe(false);
    expect(isValidSlug("pricing")).toBe(false);
    expect(isValidSlug("app")).toBe(false);
  });

  it("allows relative, https, mailto and tel links only", () => {
    expect(isSafeHref("/pricing")).toBe(true);
    expect(isSafeHref("https://kvk.nl")).toBe(true);
    expect(isSafeHref("mailto:support@stagedesk.pro")).toBe(true);
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
    expect(isSafeHref("//evil.example.com")).toBe(false);
  });
});

describe("inline formatting", () => {
  it("parses bold, italic and safe links; leaves the rest as text", () => {
    expect(parseInline("Lees de **voorwaarden** en *ons* [beleid](/privacy).")).toEqual([
      { type: "text", text: "Lees de " },
      { type: "bold", text: "voorwaarden" },
      { type: "text", text: " en " },
      { type: "italic", text: "ons" },
      { type: "text", text: " " },
      { type: "link", text: "beleid", href: "/privacy" },
      { type: "text", text: "." },
    ]);
    expect(parseInline("[klik](javascript:alert(1))")).toEqual([
      { type: "text", text: "[klik](javascript:alert(1)" },
      { type: "text", text: ")" },
    ]);
    expect(parseInline("<b>no html</b>")).toEqual([{ type: "text", text: "<b>no html</b>" }]);
  });
});

describe("version compare", () => {
  it("shows removed and added lines", () => {
    const before = blocksToLines({ title: "Voorwaarden", seoTitle: "", seoDescription: "", blocks: [{ type: "paragraph", text: "Oud" }, { type: "paragraph", text: "Blijft" }] });
    const after = blocksToLines({ title: "Voorwaarden", seoTitle: "", seoDescription: "", blocks: [{ type: "paragraph", text: "Blijft" }, { type: "list", ordered: true, items: ["Nieuw"] }] });
    expect(diffLines(before, after)).toEqual([
      { op: "same", text: "# Voorwaarden" },
      { op: "del", text: "Oud" },
      { op: "same", text: "Blijft" },
      { op: "add", text: "1. Nieuw" },
    ]);
  });
});

describe("legal acceptance", () => {
  const pages = [
    { id: "terms", acceptance: "all", publishedVersionId: "t2" },
    { id: "dpa", acceptance: "agencies", publishedVersionId: "d1" },
    { id: "about", acceptance: "none", publishedVersionId: "a1" },
    { id: "draft", acceptance: "all", publishedVersionId: null },
  ];
  it("asks for the newest published version, and the DPA only from agencies", () => {
    expect(pendingAcceptances(pages, new Set(["t1"]), false).map((p) => p.id)).toEqual(["terms"]);
    expect(pendingAcceptances(pages, new Set(["t1"]), true).map((p) => p.id)).toEqual(["terms", "dpa"]);
    expect(pendingAcceptances(pages, new Set(["t2", "d1"]), true)).toEqual([]);
  });
});
