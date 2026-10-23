import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AudiencePage } from "@/components/site/audience-page";
import { primaryCta } from "@/components/site/site-chrome";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/for-agencies">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "forAgencies" });
  return pageMetadata({ locale, title: t("title"), description: t("intro"), paths: { nl: "/for-agencies", en: "/for-agencies" }, kicker: t("eyebrow") });
}

export default async function ForAgenciesPage({ params }: PageProps<"/[locale]/for-agencies">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="mx-auto my-16 h-96 w-full max-w-6xl" />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  await connection();
  return <AudiencePage namespace="forAgencies" cta={await primaryCta()} />;
}
