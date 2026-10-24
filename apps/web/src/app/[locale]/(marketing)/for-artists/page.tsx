import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArtistsPage } from "@/components/site/audience-page";
import type { Locale } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/for-artists">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "forArtists" });
  return pageMetadata({ locale, title: t("title"), description: t("intro"), paths: { nl: "/for-artists", en: "/for-artists" }, kicker: t("eyebrow") });
}

export default async function ForArtistsPage({ params }: PageProps<"/[locale]/for-artists">) {
  setRequestLocale((await params).locale as Locale);
  return <ArtistsPage />;
}
