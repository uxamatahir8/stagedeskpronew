import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageIntro } from "@/components/site/page-intro";
import { loadChangelog } from "@/content/changelog";
import type { Locale } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/changelog">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "changelog" });
  return pageMetadata({ locale, title: t("title"), description: t("intro"), paths: { nl: "/changelog", en: "/changelog" } });
}

export default async function ChangelogPage({ params }: PageProps<"/[locale]/changelog">) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const [t, Body] = await Promise.all([getTranslations("changelog"), loadChangelog(locale)]);
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-10 px-4 py-16 sm:px-6 sm:py-20">
      <PageIntro title={t("title")} intro={t("intro")} />
      <div className="text-[1.0625rem] text-foreground/90 [&_h2]:border-t [&_h2]:pt-8 [&_h2:first-child]:mt-0 [&_h2:first-child]:border-0 [&_h2:first-child]:pt-0">
        <Body />
      </div>
    </main>
  );
}
