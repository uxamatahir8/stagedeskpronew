// Shared by the editor (client) and its page (server).

export interface LocaleText {
  title: string;
  excerpt: string;
  body: string;
  seoTitle: string;
  seoDescription: string;
}

export interface ArticleValues {
  slug: string;
  categoryId: string;
  status: "draft" | "published";
  featured: boolean;
  /** ISO from the server; shown in the editor in the browser's time zone. */
  publishedAt: string;
  coverImage: string;
  authorName: string;
  position: number;
  nl: LocaleText;
  en: LocaleText;
}

export const emptyText: LocaleText = { title: "", excerpt: "", body: "", seoTitle: "", seoDescription: "" };
