import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CategoryFront, FrontSkeleton, Masthead } from "@/components/content/blog-front";
import type { Locale } from "@/i18n/routing";
import { contentCategories } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";

async function findCategory(slug: string) {
  return (await contentCategories("blog")).find((c) => c.slug === slug) ?? null;
}

export async function generateMetadata({ params }: PageProps<"/[locale]/blog/category/[category]">): Promise<Metadata> {
  const { locale, category } = await params;
  const c = await findCategory(category);
  if (!c) return { robots: { index: false } };
  const t = await getTranslations({ locale: locale as Locale, namespace: "blog" });
  const en = locale === "en";
  const name = en ? c.nameEn : c.nameNl;
  return pageMetadata({
    locale: locale as Locale,
    title: `${name} · ${t("title")}`,
    description: (en ? c.descriptionEn : c.descriptionNl) || t("intro"),
    paths: { nl: `/blog/category/${c.slug}`, en: `/blog/category/${c.slug}` },
    kicker: t("title"),
  });
}

/** All posts in one category, newest first. */
export default function BlogCategoryPage({ params, searchParams }: PageProps<"/[locale]/blog/category/[category]">) {
  return (
    <main className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <Suspense fallback={<FrontSkeleton />}>
        <Front params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Front({ params, searchParams }: Pick<PageProps<"/[locale]/blog/category/[category]">, "params" | "searchParams">) {
  const { locale, category } = await params;
  setRequestLocale(locale as Locale);
  const c = await findCategory(category);
  if (!c) notFound();
  const page = Math.max(1, Number((await searchParams).page) || 1);
  const en = locale === "en";
  const description = en ? c.descriptionEn : c.descriptionNl;
  return (
    <>
      <Masthead locale={locale as Locale} active={c.slug} />
      <header className="grid gap-2">
        <h2 className="font-editorial text-4xl font-semibold tracking-tight">{en ? c.nameEn : c.nameNl}</h2>
        {description && <p className="max-w-2xl text-lg text-muted-foreground">{description}</p>}
      </header>
      <CategoryFront locale={locale as Locale} slug={c.slug} page={page} />
    </>
  );
}
