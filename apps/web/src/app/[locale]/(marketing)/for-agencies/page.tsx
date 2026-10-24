import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AgenciesPage } from "@/components/site/audience-page";
import type { Locale } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/for-agencies">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "forAgencies" });
  return pageMetadata({ locale, title: t("title"), description: t("intro"), paths: { nl: "/for-agencies", en: "/for-agencies" }, kicker: t("eyebrow") });
}

export default async function ForAgenciesPage({ params }: PageProps<"/[locale]/for-agencies">) {
  setRequestLocale((await params).locale as Locale);
  return <AgenciesPage />;
}
