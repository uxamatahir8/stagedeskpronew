import { describe, expect, it } from "vitest";
import { articleLocaleSchema, coverImage, headingId, readingMinutes, tableOfContents } from "./content";

describe("website content", () => {
  it("builds a table of contents from h2 and h3, skipping code blocks", () => {
    const body = "Intro\n\n## Hoeveel vraag je?\n\nText\n\n### Per *offerte*\n\n```\n## not a heading\n```\n\n## Één keer";
    expect(tableOfContents(body)).toEqual([
      { level: 2, text: "Hoeveel vraag je?", id: "hoeveel-vraag-je" },
      { level: 3, text: "Per offerte", id: "per-offerte" },
      { level: 2, text: "Één keer", id: "een-keer" },
    ]);
    expect(headingId("!!!")).toBe("section");
  });

  it("estimates reading time and validates covers and text", () => {
    expect(readingMinutes("word ".repeat(1000))).toBe(5);
    expect(readingMinutes("")).toBe(1);
    expect(coverImage.safeParse("/files/x.webp").success).toBe(true);
    expect(coverImage.safeParse("javascript:alert(1)").success).toBe(false);
    expect(articleLocaleSchema.safeParse({ title: "Hi", body: "" }).success).toBe(false);
  });
});
