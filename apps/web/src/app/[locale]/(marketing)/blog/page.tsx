import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { BlogFront, FrontSkeleton, Masthead } from "@/components/content/blog-front";
import type { Locale } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/blog">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "blog" });
  return pageMetadata({ locale, title: t("title"), description: t("intro"), paths: { nl: "/blog", en: "/blog" } });
}

export default function BlogPage({ params, searchParams }: PageProps<"/[locale]/blog">) {
  return (
    <main className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <Suspense fallback={<FrontSkeleton />}>
        <Front params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Front({ params, searchParams }: Pick<PageProps<"/[locale]/blog">, "params" | "searchParams">) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const page = Math.max(1, Number((await searchParams).page) || 1);
  return (
    <>
      <Masthead locale={locale} active={null} />
      <BlogFront locale={locale} page={page} />
    </>
  );
}
