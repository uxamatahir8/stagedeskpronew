import { ChevronRightIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { ContactBand } from "@/components/content/help-parts";
import { Markdown } from "@/components/content/markdown";
import { Toc } from "@/components/content/toc";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { contentArticle, contentList } from "@/lib/content";
import { cn } from "@/lib/utils";
import { jsonLd, pageMetadata, siteUrl } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/help/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const found = await contentArticle("help", slug, locale as Locale);
  if (!found) return { robots: { index: false } };
  const t = await getTranslations({ locale: locale as Locale, namespace: "help" });
  const a = found.article;
  return pageMetadata({ locale: locale as Locale, title: a.seoTitle, description: a.seoDescription, paths: { nl: `/help/${slug}`, en: `/help/${slug}` }, type: "article", kicker: t("title") });
}

export default function HelpArticlePage({ params }: PageProps<"/[locale]/help/[slug]">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto my-16 h-[40rem] w-full max-w-6xl" />}>
      <Article params={params} />
    </Suspense>
  );
}

async function Article({ params }: Pick<PageProps<"/[locale]/help/[slug]">, "params">) {
  const { locale, slug } = await params;
  setRequestLocale(locale as Locale);
  const found = await contentArticle("help", slug, locale as Locale);
  if (!found) notFound();
  const { article: a } = found;
  const [t, format, { articles }] = await Promise.all([getTranslations("help"), getFormatter(), contentList("help", locale as Locale, { pageSize: 500 })]);
  // The other articles in this topic, for the side menu and the "next" link.
  const topic = articles.filter((x) => x.categoryId === a.categoryId);
  const index = topic.findIndex((x) => x.id === a.id);
  const next = index >= 0 ? topic[index + 1] : undefined;

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-16 px-4 py-10 sm:px-6 sm:py-14">
      <div className="grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14">
        <aside className="hidden lg:block">
          <nav aria-label={a.category?.name ?? t("title")} className="sticky top-24 grid gap-3 text-sm">
            <Link href="/help" className="text-muted-foreground hover:text-foreground">
              {t("title")}
            </Link>
            {a.category && <p className="font-semibold">{a.category.name}</p>}
            <ul className="grid gap-0.5 border-l">
              {topic.map((x) => (
                <li key={x.id}>
                  <Link
                    href={`/help/${x.slug}`}
                    aria-current={x.id === a.id ? "page" : undefined}
                    className={cn("-ml-px block border-l py-1.5 pl-4 leading-snug", x.id === a.id ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
                  >
                    {x.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <div className="grid min-w-0 gap-10 xl:grid-cols-[minmax(0,1fr)_13rem] xl:gap-12">
          <article className="grid min-w-0 content-start gap-8">
            <header className="grid gap-4">
              <nav aria-label={t("breadcrumb")}>
                <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                  <li>
                    <Link href="/help" className="hover:text-foreground">
                      {t("title")}
                    </Link>
                  </li>
                  {a.category && (
                    <li className="flex items-center gap-1">
                      <ChevronRightIcon className="size-3.5" aria-hidden />
                      <Link href={`/help#${a.category.slug}`} className="font-medium text-primary hover:underline">
                        {a.category.name}
                      </Link>
                    </li>
                  )}
                </ol>
              </nav>
              <h1 className="font-editorial text-4xl leading-tight font-bold tracking-tight text-balance sm:text-5xl">{a.title}</h1>
              {a.excerpt && <p className="text-lg text-muted-foreground">{a.excerpt}</p>}
              <p className="text-sm text-muted-foreground">{t("updated", { date: format.dateTime(a.updatedAt, { day: "numeric", month: "long", year: "numeric" }) })}</p>
            </header>
            <Markdown className="border-t pt-8">{a.body}</Markdown>
            {next && (
              <Link href={`/help/${next.slug}`} className="grid gap-1 rounded-xl border p-5 transition-colors hover:border-primary/50">
                <span className="text-sm text-muted-foreground">{t("next")}</span>
                <span className="font-semibold text-primary">{next.title}</span>
              </Link>
            )}
          </article>
          <aside className="hidden xl:block">
            <Toc body={a.body} title={t("toc")} className="sticky top-24" />
          </aside>
        </div>
      </div>

      <ContactBand />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd({
          "@type": "TechArticle",
          headline: a.title,
          description: a.seoDescription,
          dateModified: a.updatedAt.toISOString(),
          inLanguage: locale,
          url: siteUrl(locale as Locale, `/help/${slug}`),
        })}
      />
    </main>
  );
}
