import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "./client";
import { ContentError, deleteContentCategory, publishedArticle, publishedArticles, saveContentArticle, saveContentCategory } from "./content";

// Slugs carry the run id, so tests never touch the real content.
const run = `t${Date.now().toString(36)}`;
const text = (title: string) => ({ title, excerpt: "", body: `Body of ${title}`, seoTitle: "", seoDescription: "" });
const input = (slug: string, extra: Partial<Parameters<typeof saveContentArticle>[2]> = {}) => ({
  slug,
  categoryId: null,
  status: "published" as const,
  featured: false,
  publishedAt: null,
  coverImage: "",
  authorName: "",
  nl: text(slug),
  en: null,
  ...extra,
});

afterAll(async () => {
  await prisma.contentArticle.deleteMany({ where: { slug: { startsWith: run } } });
  await prisma.contentCategory.deleteMany({ where: { slug: { startsWith: run } } });
});

describe("content", () => {
  it("rejects a slug that's taken and unsafe cover images", async () => {
    await saveContentArticle("blog", null, input(`${run}-a`));
    await expect(saveContentArticle("blog", null, input(`${run}-a`))).rejects.toThrow(ContentError);
    await expect(saveContentArticle("blog", null, input(`${run}-b`, { coverImage: "javascript:alert(1)" }))).rejects.toThrow(ContentError);
    // The same slug is fine for another kind.
    await expect(saveContentArticle("help", null, input(`${run}-a`))).resolves.toBeTruthy();
  });

  it("shows only live posts, featured first, then newest", async () => {
    await saveContentArticle("blog", null, input(`${run}-old`, { publishedAt: "2020-01-01T10:00:00Z" }));
    await saveContentArticle("blog", null, input(`${run}-feat`, { publishedAt: "2019-01-01T10:00:00Z", featured: true }));
    await saveContentArticle("blog", null, input(`${run}-draft`, { status: "draft" }));
    await saveContentArticle("blog", null, input(`${run}-later`, { publishedAt: "2999-01-01T10:00:00Z" }));
    const { rows } = await publishedArticles("blog", { pageSize: 500 });
    const ours = rows.map((r) => r.slug).filter((s) => s.startsWith(run));
    expect(ours[0]).toBe(`${run}-feat`);
    expect(ours).not.toContain(`${run}-draft`);
    expect(ours).not.toContain(`${run}-later`);
    expect(await publishedArticle("blog", `${run}-later`)).toBeNull();
  });

  it("filters by category and keeps categories with articles", async () => {
    const cat = await saveContentCategory("blog", null, { slug: `${run}-cat`, nameNl: "Testcat", nameEn: "Test cat" });
    await saveContentArticle("blog", null, input(`${run}-incat`, { categoryId: cat.id }));
    const { rows } = await publishedArticles("blog", { categorySlug: `${run}-cat` });
    expect(rows.map((r) => r.slug)).toEqual([`${run}-incat`]);
    await expect(deleteContentCategory(cat.id)).rejects.toThrow(ContentError);
  });
});
