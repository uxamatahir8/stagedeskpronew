import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Markdown } from "@/components/content/markdown";
import { PageIntro } from "@/components/site/page-intro";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { contentList } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/changelog">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "changelog" });
  return pageMetadata({ locale, title: t("title"), description: t("intro"), paths: { nl: "/changelog", en: "/changelog" } });
}

export default async function ChangelogPage({ params }: PageProps<"/[locale]/changelog">) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations("changelog");
  return (
    <main className="mx-auto grid w-full max-w-4xl gap-12 px-4 py-16 sm:px-6 sm:py-20">
      <PageIntro title={t("title")} intro={t("intro")} />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Releases locale={locale} />
      </Suspense>
    </main>
  );
}

/** Releases newest first, each with its date on the left like a timeline. */
async function Releases({ locale }: { locale: Locale }) {
  const [format, { articles }] = await Promise.all([getFormatter(), contentList("changelog", locale, { pageSize: 100 })]);
  return (
    <ol className="grid">
      {articles.map((r) => (
        <li key={r.id} className="grid gap-3 border-t py-10 first:border-t-0 first:pt-0 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-8">
          {r.publishedAt && (
            <time dateTime={r.publishedAt.toISOString()} className="text-sm text-muted-foreground sm:pt-1.5">
              {format.dateTime(r.publishedAt, { day: "numeric", month: "long", year: "numeric" })}
            </time>
          )}
          <div className="grid gap-2">
            <h2 className="text-2xl font-semibold tracking-tight text-balance">{r.title}</h2>
            <Markdown className="[&_ul]:my-3">{r.body}</Markdown>
          </div>
        </li>
      ))}
    </ol>
  );
}
