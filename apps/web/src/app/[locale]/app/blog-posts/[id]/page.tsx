import { ArrowLeftIcon } from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { type ArticleLocale } from "@stagedesk/core";
import { contributorArticle, listContentCategories } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { appUrl } from "@/lib/mail";
import { requirePermission } from "@/lib/viewer";
import { ArticleEditor } from "../../content/article-editor";
import { type ArticleValues, emptyText, type LocaleText } from "../../content/article-values";

const text = (x: unknown): LocaleText => ({ ...emptyText, ...((x as Partial<ArticleLocale> | null) ?? {}) });

export default function BlogPostEditorPage({ params }: PageProps<"/[locale]/app/blog-posts/[id]">) {
  return <Suspense fallback={<Skeleton className="h-[40rem]" />}><Editor params={params} /></Suspense>;
}

async function Editor({ params }: Pick<PageProps<"/[locale]/app/blog-posts/[id]">, "params">) {
  const { id, locale } = await params;
  setRequestLocale(locale as Locale);
  const viewer = await requirePermission("blog.submit");
  const isNew = id === "new";
  const article = isNew ? null : await contributorArticle(viewer.user.id, id);
  if (!isNew && (!article || !["draft", "rejected"].includes(article.status))) notFound();
  const [t, categories] = await Promise.all([getTranslations("blogContributions"), listContentCategories("blog")]);
  const initial: ArticleValues = article ? {
    slug: article.slug, categoryId: article.categoryId ?? "", status: article.status as "draft" | "rejected", featured: false,
    publishedAt: "", coverImage: article.coverImage ?? "", authorName: article.authorName ?? viewer.user.name, position: 0,
    nl: text(article.nl), en: text(article.en),
  } : { slug: "", categoryId: "", status: "draft", featured: false, publishedAt: "", coverImage: "", authorName: viewer.user.name, position: 0, nl: emptyText, en: emptyText };
  return <div className="grid gap-6">
    <Button asChild variant="ghost" size="sm" className="w-fit"><Link href="/app/blog-posts"><ArrowLeftIcon />{t("title")}</Link></Button>
    <PageHeader title={article ? (article.nl as ArticleLocale).title : t("new")} />
    <ArticleEditor kind="blog" id={article?.id ?? null} contributor initial={initial} rejectionReason={article?.rejectionReason} categories={categories.map((c) => ({ id: c.id, name: locale === "en" ? c.nameEn : c.nameNl }))} siteUrl={appUrl.replace(/^https?:\/\//, "")} />
  </div>;
}
