import { z } from "zod";

/**
 * Pages are built from a small set of blocks, stored as data (never HTML) and
 * rendered by React, so nothing an editor types can inject markup.
 */
const text = (max: number) => z.string().trim().max(max);

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), level: z.union([z.literal(2), z.literal(3)]), text: text(200).min(1) }),
  z.object({ type: z.literal("paragraph"), text: text(5000).min(1) }),
  z.object({ type: z.literal("list"), ordered: z.boolean(), items: z.array(text(1000).min(1)).min(1).max(100) }),
  z.object({ type: z.literal("table"), header: z.array(text(200)).min(1).max(8), rows: z.array(z.array(text(1000))).max(100) }),
  z.object({ type: z.literal("image"), url: z.string().trim().max(500).refine(isSafeImageUrl, "unsafe url"), alt: text(300), caption: text(300).optional() }),
  z.object({ type: z.literal("callout"), tone: z.enum(["info", "warning"]), text: text(2000).min(1) }),
]);
export type Block = z.infer<typeof blockSchema>;
export const blockTypes = ["heading", "paragraph", "list", "table", "image", "callout"] as const;

export const pageLocaleSchema = z.object({
  title: text(160).min(1),
  seoTitle: text(70).optional().default(""),
  seoDescription: text(170).optional().default(""),
  blocks: z.array(blockSchema).max(200),
});
export const pageContentSchema = z.object({ nl: pageLocaleSchema, en: pageLocaleSchema });
export type PageLocaleContent = z.infer<typeof pageLocaleSchema>;
export type PageContent = z.infer<typeof pageContentSchema>;

export const pagePlacements = ["none", "header", "footer_product", "footer_company", "footer_legal"] as const;
export type PagePlacement = (typeof pagePlacements)[number];
export const legalKeys = ["terms", "privacy", "cookies", "dpa", "imprint"] as const;
export type LegalKey = (typeof legalKeys)[number];

/** Top-level paths the app already uses; a page can't take them. */
export const reservedSlugs = new Set([
  "app", "api", "b", "q", "embed", "en", "nl", "files", "partners", "pricing", "features", "blog", "help", "contact",
  "changelog", "for-agencies", "for-artists", "sign-in", "sign-up", "onboarding", "invite", "forgot-password",
  "reset-password", "two-factor", "accept-terms", "waitlist", "og", "sitemap.xml", "robots.txt", "about", "over-ons", "solutions", "request", "tour",
]);

export function isValidSlug(slug: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 96 && !reservedSlugs.has(slug);
}

/** Uploaded files, or https images from elsewhere. */
export function isSafeImageUrl(url: string) {
  return url.startsWith("/files/") || /^https:\/\/[^\s"'<>]+$/.test(url);
}

/** Links an editor may use: relative paths, https, mailto and tel. */
export function isSafeHref(href: string) {
  return /^\/(?!\/)[^\s]*$/.test(href) || /^https?:\/\/[^\s"'<>]+$/.test(href) || /^mailto:[^\s"'<>]+$/.test(href) || /^tel:\+?[0-9 ()-]+$/.test(href);
}

export type InlineToken =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "link"; text: string; href: string };

/**
 * The inline formatting editors can use in text: **bold**, *italic* and
 * [link text](https://…). Anything else, including unsafe links, stays text.
 */
export function parseInline(input: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  const pattern = /\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (const match of input.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) tokens.push({ type: "text", text: input.slice(last, index) });
    if (match[1] !== undefined) tokens.push({ type: "bold", text: match[1] });
    else if (match[2] !== undefined) tokens.push({ type: "italic", text: match[2] });
    else if (match[3] !== undefined && isSafeHref(match[4]!)) tokens.push({ type: "link", text: match[3], href: match[4]! });
    else tokens.push({ type: "text", text: match[0] });
    last = index + match[0].length;
  }
  if (last < input.length) tokens.push({ type: "text", text: input.slice(last) });
  return tokens;
}

/** A page's text as lines, for comparing two versions. */
export function blocksToLines(content: PageLocaleContent) {
  const lines = [`# ${content.title}`];
  for (const b of content.blocks) {
    if (b.type === "heading") lines.push(`${b.level === 2 ? "##" : "###"} ${b.text}`);
    else if (b.type === "paragraph") lines.push(b.text);
    else if (b.type === "list") b.items.forEach((item, i) => lines.push(`${b.ordered ? `${i + 1}.` : "-"} ${item}`));
    else if (b.type === "table") [b.header, ...b.rows].forEach((row) => lines.push(`| ${row.join(" | ")} |`));
    else if (b.type === "image") lines.push(`[image: ${b.alt || b.url}]`);
    else lines.push(`! ${b.text}`);
  }
  return lines;
}

export type DiffLine = { op: "same" | "add" | "del"; text: string };

/** Line diff (longest common subsequence): what was removed and added between two versions. */
export function diffLines(before: string[], after: string[]): DiffLine[] {
  const n = before.length;
  const m = after.length;
  const lcs = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = before[i] === after[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      out.push({ op: "same", text: before[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) out.push({ op: "del", text: before[i++]! });
    else out.push({ op: "add", text: after[j++]! });
  }
  while (i < n) out.push({ op: "del", text: before[i++]! });
  while (j < m) out.push({ op: "add", text: after[j++]! });
  return out;
}

/**
 * Which published legal versions someone still has to accept: pages asking
 * everyone, plus those asking agencies when they belong to one.
 */
export function pendingAcceptances(
  pages: { id: string; acceptance: string; publishedVersionId: string | null }[],
  acceptedVersionIds: Set<string>,
  isAgencyMember: boolean,
) {
  return pages.filter(
    (p) =>
      p.publishedVersionId !== null &&
      (p.acceptance === "all" || (p.acceptance === "agencies" && isAgencyMember)) &&
      !acceptedVersionIds.has(p.publishedVersionId),
  );
}
