import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { Blocks } from "@/components/site/blocks";
import { Skeleton } from "@/components/ui/skeleton";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";
import { sitePage } from "@/lib/site";

export async function generateMetadata({ params }: PageProps<"/[locale]/[slug]">): Promise<Metadata> {
  await connection();
  const { locale, slug } = await params;
  const found = await sitePage(slug);
  if (!found) return {};
  const content = found.content[locale as Locale];
  return pageMetadata({
    locale: locale as Locale,
    title: content.seoTitle || content.title,
    description: content.seoDescription || content.title,
    paths: { nl: `/${found.page.slugNl}`, en: `/${found.page.slugEn}` },
  });
}

/** A page built in the page builder (About, Terms, Privacy, …). */
export default function BuilderPage({ params }: PageProps<"/[locale]/[slug]">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto my-16 h-96 w-full max-w-3xl" />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: Pick<PageProps<"/[locale]/[slug]">, "params">) {
  await connection();
  const { locale, slug } = await params;
  setRequestLocale(locale as Locale);
  const found = await sitePage(slug);
  if (!found) notFound();
  // The Dutch slug under /en (or the other way round) goes to the right one.
  const ownSlug = locale === "en" ? found.page.slugEn : found.page.slugNl;
  if (slug !== ownSlug) redirect({ href: `/${ownSlug}`, locale: locale as Locale });

  const [t, format] = await Promise.all([getTranslations("site"), getFormatter()]);
  const content = found.content[locale as Locale];
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-16 sm:px-6 sm:py-20">
      <header className="grid gap-3">
        <h1 className="text-4xl font-bold tracking-tight text-balance">{content.title}</h1>
        {found.page.kind === "legal" && found.publishedAt && (
          <p className="text-sm text-muted-foreground">{t("lastUpdated", { date: format.dateTime(found.publishedAt, { day: "numeric", month: "long", year: "numeric" }) })}</p>
        )}
      </header>
      <Blocks blocks={content.blocks} />
    </main>
  );
}
