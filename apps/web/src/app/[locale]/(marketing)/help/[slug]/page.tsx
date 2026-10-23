import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";
import { articles, findArticle, loadArticle } from "@/content/help";
import { Link } from "@/i18n/navigation";
import { type Locale, routing } from "@/i18n/routing";
import { jsonLd, pageMetadata, siteUrl } from "@/lib/seo";

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => articles.map((a) => ({ locale, slug: a.slug })));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/help/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const article = findArticle(slug);
  if (!article) return {};
  const t = await getTranslations({ locale: locale as Locale, namespace: "help" });
  const meta = article[locale as Locale];
  return pageMetadata({ locale: locale as Locale, title: meta.title, description: meta.description, paths: { nl: `/help/${slug}`, en: `/help/${slug}` }, type: "article", kicker: t("title") });
}

export default function HelpArticlePage({ params }: PageProps<"/[locale]/help/[slug]">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto my-16 h-[40rem] w-full max-w-3xl" />}>
      <Article params={params} />
    </Suspense>
  );
}

async function Article({ params }: Pick<PageProps<"/[locale]/help/[slug]">, "params">) {
  const { locale, slug } = await params;
  setRequestLocale(locale as Locale);
  const article = findArticle(slug);
  if (!article) notFound();
  const [t, Body] = await Promise.all([getTranslations("help"), loadArticle(slug, locale as Locale)]);
  const meta = article[locale as Locale];
  const related = articles.filter((a) => a.category === article.category && a.slug !== slug);

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-10 px-4 py-16 sm:px-6 sm:py-20">
      <Link href="/help" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" aria-hidden />
        {t("title")}
      </Link>
      <article className="grid gap-6">
        <header className="grid gap-3">
          <p className="text-sm font-medium text-primary">{t(`category_${article.category}`)}</p>
          <h1 className="text-4xl font-bold tracking-tight text-balance">{meta.title}</h1>
          <p className="text-lg text-muted-foreground">{meta.description}</p>
        </header>
        <div className="text-[1.0625rem] text-foreground/90">
          <Body />
        </div>
      </article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd({ "@type": "TechArticle", headline: meta.title, description: meta.description, inLanguage: locale, url: siteUrl(locale as Locale, `/help/${slug}`) })}
      />
      {related.length > 0 && (
        <nav className="grid gap-3 border-t pt-8" aria-label={t("related")}>
          <h2 className="font-semibold">{t("related")}</h2>
          <ul className="grid gap-2">
            {related.map((a) => (
              <li key={a.slug}>
                <Link href={`/help/${a.slug}`} className="font-medium text-primary underline-offset-4 hover:underline">
                  {a[locale as Locale].title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </main>
  );
}
