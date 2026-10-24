import { ArrowRightIcon, ChevronRightIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@stagedesk/db";
import { ArticleCard, Cover } from "@/components/content/article-parts";
import { Markdown } from "@/components/content/markdown";
import { ShareLinks } from "@/components/content/share-links";
import { Toc } from "@/components/content/toc";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { contentArticle } from "@/lib/content";
import { appUrl } from "@/lib/mail";
import { jsonLd, pageMetadata, siteUrl } from "@/lib/seo";
import { turnstileSiteKey } from "@/lib/turnstile";
import { CommentForm } from "./comment-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/blog/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const found = await contentArticle("blog", slug, locale as Locale);
  if (!found) return { robots: { index: false } };
  const a = found.article;
  return pageMetadata({
    locale: locale as Locale,
    title: a.seoTitle,
    description: a.seoDescription,
    paths: { nl: `/blog/${slug}`, en: `/blog/${slug}` },
    type: "article",
    publishedTime: a.publishedAt?.toISOString(),
    modifiedTime: a.updatedAt.toISOString(),
    image: a.cover,
    kicker: "Blog",
  });
}

export default function PostPage({ params }: PageProps<"/[locale]/blog/[slug]">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto my-16 h-[40rem] w-full max-w-4xl" />}>
      <Post params={params} />
    </Suspense>
  );
}

async function Post({ params }: Pick<PageProps<"/[locale]/blog/[slug]">, "params">) {
  const { locale, slug } = await params;
  setRequestLocale(locale as Locale);
  const found = await contentArticle("blog", slug, locale as Locale);
  if (!found) notFound();
  const { article: a, related } = found;
  const [t, format] = await Promise.all([getTranslations("blog"), getFormatter()]);
  const url = siteUrl(locale as Locale, `/blog/${slug}`);
  const date = (d: Date) => format.dateTime(d, { day: "numeric", month: "long", year: "numeric" });
  // Show "updated" only for real edits, not the save right after publishing.
  const updated = a.publishedAt && a.updatedAt.getTime() - a.publishedAt.getTime() > 86_400_000;
  const initials = (a.author ?? "StageDesk")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <main className="grid gap-20 pb-20">
      <article className="grid gap-10 pt-10 sm:pt-14">
        <header className="mx-auto grid w-full max-w-4xl gap-6 px-4 sm:px-6">
          <nav aria-label={t("breadcrumb")}>
            <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
              <li>
                <Link href="/blog" className="hover:text-foreground">
                  {t("title")}
                </Link>
              </li>
              {a.category && (
                <li className="flex items-center gap-1">
                  <ChevronRightIcon className="size-3.5" aria-hidden />
                  <Link href={`/blog/category/${a.category.slug}`} className="font-medium text-primary hover:underline">
                    {a.category.name}
                  </Link>
                </li>
              )}
            </ol>
          </nav>
          <h1 className="font-editorial text-4xl leading-[1.1] font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">{a.title}</h1>
          {a.excerpt && <p className="text-xl leading-relaxed text-pretty text-muted-foreground">{a.excerpt}</p>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-y py-4 text-sm">
            <span className="grid size-10 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground" aria-hidden>
              {initials}
            </span>
            <span className="grid">
              {a.author && <span className="font-medium">{t("byline", { author: a.author })}</span>}
              <span className="text-muted-foreground">
                {a.publishedAt && <time dateTime={a.publishedAt.toISOString()}>{date(a.publishedAt)}</time>} · {t("minutes", { count: a.minutes })}
                {updated && ` · ${t("updated", { date: date(a.updatedAt) })}`}
              </span>
            </span>
          </div>
          {!a.translated && <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">{t("notTranslated")}</p>}
        </header>

        {a.cover && (
          <figure className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <Cover article={a} sizes="(min-width: 1152px) 1100px, 100vw" priority className="rounded-2xl border" />
          </figure>
        )}

        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-14 xl:grid-cols-[13rem_minmax(0,42rem)_13rem]">
          <aside className="hidden lg:block">
            <Toc body={a.body} title={t("toc")} className="sticky top-24" />
          </aside>
          <div className="grid min-w-0 content-start gap-12">
            <Markdown>{a.body}</Markdown>
            <ShareLinks url={url} title={a.title} className="border-t pt-8 xl:hidden" />
          </div>
          <aside className="hidden xl:block">
            <ShareLinks url={url} title={a.title} className="sticky top-24" />
          </aside>
        </div>
      </article>

      <section className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="grid gap-6 rounded-3xl bg-[oklch(0.24_0.08_322)] p-8 text-white sm:p-12 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="grid gap-2">
            <h2 className="font-editorial text-3xl font-semibold text-balance">{t("ctaTitle")}</h2>
            <p className="max-w-xl text-white/75">{t("ctaBody")}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-[oklch(0.66_0.2_352)] text-white hover:bg-[oklch(0.6_0.2_352)]">
              <Link href="/sign-up">
                {t("ctaButton")}
                <ArrowRightIcon className="size-4" aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
              <Link href="/tour">{t("ctaSecondary")}</Link>
            </Button>
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 sm:px-6" aria-labelledby="related">
          <h2 id="related" className="border-b-2 border-foreground/80 pb-2 font-editorial text-2xl font-semibold">
            {t("keepReading")}
          </h2>
          <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => (
              <li key={r.id}>
                <ArticleCard article={r} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mx-auto grid w-full max-w-3xl gap-6 px-4 sm:px-6" aria-labelledby="comments">
        <h2 id="comments" className="font-editorial text-2xl font-semibold">
          {t("comments")}
        </h2>
        <Suspense fallback={<Skeleton className="h-24 w-full" />}>
          <Comments slug={slug} locale={locale as Locale} />
        </Suspense>
        <CommentForm slug={slug} turnstileKey={turnstileSiteKey()} />
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd({
          "@type": "BlogPosting",
          headline: a.title,
          description: a.seoDescription,
          ...(a.cover ? { image: a.cover.startsWith("/") ? `${appUrl}${a.cover}` : a.cover } : {}),
          ...(a.publishedAt ? { datePublished: a.publishedAt.toISOString() } : {}),
          dateModified: a.updatedAt.toISOString(),
          inLanguage: locale,
          wordCount: a.body.split(/\s+/).length,
          ...(a.category ? { articleSection: a.category.name } : {}),
          url,
          mainEntityOfPage: url,
          author: { "@type": a.author ? "Person" : "Organization", name: a.author ?? "StageDesk" },
          publisher: { "@type": "Organization", name: "StageDesk", logo: { "@type": "ImageObject", url: `${appUrl}/icon.png` } },
        })}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd({
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: t("title"), item: siteUrl(locale as Locale, "/blog") },
            ...(a.category ? [{ "@type": "ListItem", position: 2, name: a.category.name, item: siteUrl(locale as Locale, `/blog/category/${a.category.slug}`) }] : []),
            { "@type": "ListItem", position: a.category ? 3 : 2, name: a.title, item: url },
          ],
        })}
      />
    </main>
  );
}

async function Comments({ slug, locale }: { slug: string; locale: Locale }) {
  await connection();
  const [t, format, comments] = await Promise.all([
    getTranslations("blog"),
    getFormatter(),
    prisma.blogComment.findMany({ where: { postSlug: slug, locale, status: "approved" }, orderBy: { createdAt: "asc" }, take: 200 }),
  ]);
  if (comments.length === 0) return <p className="text-muted-foreground">{t("noComments")}</p>;
  return (
    <ol className="grid gap-4">
      {comments.map((c) => (
        <li key={c.id} className="grid gap-1 rounded-xl border bg-card p-4">
          <p className="text-sm">
            <span className="font-medium">{c.authorName}</span>{" "}
            <span className="text-muted-foreground">· {format.dateTime(c.createdAt, { day: "numeric", month: "short", year: "numeric" })}</span>
          </p>
          <p className="whitespace-pre-line">{c.body}</p>
        </li>
      ))}
    </ol>
  );
}
