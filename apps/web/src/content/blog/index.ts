import type { MDXContent } from "mdx/types";

/**
 * Blog posts. Add a post: write `posts/<slug>.nl.mdx` and `posts/<slug>.en.mdx`,
 * then add its entry here (newest first).
 */
export interface PostMeta {
  slug: string;
  date: string;
  category: "guides" | "product";
  readingMinutes: number;
  nl: { title: string; description: string };
  en: { title: string; description: string };
}

export const posts: PostMeta[] = [
  {
    slug: "aanbetaling-en-uitbetaling",
    date: "2026-10-21",
    category: "guides",
    readingMinutes: 4,
    nl: { title: "Aanbetaling vragen zonder gedoe", description: "Waarom een aanbetaling je planning beschermt, hoeveel je vraagt en hoe het geld bij jou en je artiest komt." },
    en: { title: "Taking deposits without the hassle", description: "Why a deposit protects your schedule, how much to ask, and how the money reaches you and your artist." },
  },
  {
    slug: "offertes-die-worden-geaccepteerd",
    date: "2026-10-14",
    category: "guides",
    readingMinutes: 5,
    nl: { title: "Zo schrijf je een offerte die wordt geaccepteerd", description: "Vijf dingen die een DJ- of bandofferte duidelijk maken, en wat je beter weglaat." },
    en: { title: "How to write a quote that gets accepted", description: "Five things that make a DJ or band quote clear, and what to leave out." },
  },
];

export function findPost(slug: string) {
  return posts.find((p) => p.slug === slug) ?? null;
}

export async function loadPost(slug: string, locale: "nl" | "en"): Promise<MDXContent> {
  return (await import(`./posts/${slug}.${locale}.mdx`)).default;
}
