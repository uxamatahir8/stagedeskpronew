import { z } from "zod";
import { isSafeImageUrl } from "./pages";

/**
 * Website content managed in the admin panel: blog posts, help articles and
 * changelog entries. Bodies are Markdown; the site renders them as React
 * elements without raw HTML, so content can't inject markup or scripts.
 */
export const contentKinds = ["blog", "help", "changelog"] as const;
export type ContentKind = (typeof contentKinds)[number];

export const articleLocaleSchema = z.object({
  title: z.string().trim().min(1).max(160),
  excerpt: z.string().trim().max(400).default(""),
  body: z.string().trim().min(1).max(60_000),
  seoTitle: z.string().trim().max(70).default(""),
  seoDescription: z.string().trim().max(170).default(""),
});
export type ArticleLocale = z.infer<typeof articleLocaleSchema>;

export const contentSlug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
export const coverImage = z
  .string()
  .trim()
  .max(500)
  .refine((u) => u === "" || u.startsWith("/") || isSafeImageUrl(u), "unsafe url");

/** Minutes to read, at a calm 200 words a minute; never less than one. */
export function readingMinutes(markdown: string) {
  const words = markdown.replace(/[#>*_`[\]()-]/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** The anchor id of a heading, the same on the server and in the table of contents. */
export function headingId(text: string) {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "section"
  );
}

/** Level-2 and level-3 headings of a Markdown body, for the table of contents. */
export function tableOfContents(markdown: string) {
  const toc: { level: 2 | 3; text: string; id: string }[] = [];
  let inCode = false;
  for (const line of markdown.split("\n")) {
    if (line.trim().startsWith("```")) inCode = !inCode;
    if (inCode) continue;
    const m = /^(#{2,3})\s+(.+?)\s*#*$/.exec(line);
    if (m) toc.push({ level: m[1]!.length as 2 | 3, text: m[2]!.replace(/[*_`]/g, ""), id: headingId(m[2]!.replace(/[*_`]/g, "")) });
  }
  return toc;
}
