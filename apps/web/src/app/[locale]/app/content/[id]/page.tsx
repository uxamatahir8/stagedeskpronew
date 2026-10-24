import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { type ArticleLocale, type ContentKind, contentKinds } from "@stagedesk/core";
import { getContentArticle, listContentCategories } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { appUrl } from "@/lib/mail";
import { requirePermission } from "@/lib/viewer";
import { ArticleEditor } from "../article-editor";
import { type ArticleValues, emptyText, type LocaleText } from "../article-values";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/content/[id]">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "contentAdmin" });
  return { title: t("title") };
}

export default function EditArticlePage({ params, searchParams }: PageProps<"/[locale]/app/content/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
      <Editor params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const text = (x: unknown): LocaleText => ({ ...emptyText, ...((x as Partial<ArticleLocale> | null) ?? {}) });

async function Editor({ params, searchParams }: Pick<PageProps<"/[locale]/app/content/[id]">, "params" | "searchParams">) {
  const { id, locale } = await params;
  setRequestLocale(locale as Locale);
  await requirePermission("platform.pages");
  const t = await getTranslations("contentAdmin");
  const isNew = id === "new";
  const article = isNew ? null : await getContentArticle(id);
  if (!isNew && !article) notFound();
  const rawKind = (await searchParams)["kind"];
  const kind = (article?.kind ?? (contentKinds.includes(rawKind as ContentKind) ? rawKind : "blog")) as ContentKind;
  const categories = kind === "changelog" ? [] : await listContentCategories(kind);

  const initial: ArticleValues = article
    ? {
        slug: article.slug,
        categoryId: article.categoryId ?? "",
        status: article.status === "published" ? "published" : "draft",
        featured: article.featured,
        publishedAt: article.publishedAt?.toISOString() ?? "",
        coverImage: article.coverImage ?? "",
        authorName: article.authorName ?? "",
        position: article.position,
        nl: text(article.nl),
        en: text(article.en),
      }
    : { slug: "", categoryId: "", status: "draft", featured: false, publishedAt: "", coverImage: "", authorName: kind === "blog" ? "Team StageDesk" : "", position: 0, nl: emptyText, en: emptyText };
  const back = kind === "blog" ? "/app/content" : `/app/content?kind=${kind}`;
  const livePath = article?.status === "published" ? (kind === "changelog" ? "/changelog" : `/${kind}/${article.slug}`) : null;

  return (
    <div className="grid gap-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href={back}>
          <ArrowLeftIcon />
          {t(`kind_${kind}`)}
        </Link>
      </Button>
      <PageHeader
        title={article ? (article.nl as ArticleLocale).title : t(`new_${kind}`)}
        actions={
          livePath ? (
            <Button asChild variant="outline">
              <a href={livePath} target="_blank" rel="noreferrer">
                <ExternalLinkIcon />
                {t("view")}
              </a>
            </Button>
          ) : undefined
        }
      />
      <ArticleEditor
        kind={kind}
        id={article?.id ?? null}
        initial={initial}
        categories={categories.map((c) => ({ id: c.id, name: locale === "en" ? c.nameEn : c.nameNl }))}
        siteUrl={appUrl.replace(/^https?:\/\//, "")}
      />
    </div>
  );
}
