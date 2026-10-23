import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DetailPage } from "@/components/site/detail-page";
import type { MockupKey } from "@/components/site/mockups";
import { featurePages } from "@/components/site/site-chrome";
import { Skeleton } from "@/components/ui/skeleton";
import { type Locale, routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";

type FeatureSlug = (typeof featurePages)[number];
const mockupFor: Record<FeatureSlug, MockupKey> = {
  "booking-page": "form",
  "quotes-invoices": "quote",
  "payments-payouts": "payout",
  "artist-management": "artist",
};
const isFeature = (slug: string): slug is FeatureSlug => (featurePages as readonly string[]).includes(slug);

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => featurePages.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/features/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isFeature(slug)) return {};
  const t = await getTranslations({ locale: locale as Locale, namespace: `featureDetail.${slug}` as "featureDetail.booking-page" });
  return pageMetadata({ locale: locale as Locale, title: t("metaTitle"), description: t("metaDescription"), paths: { nl: `/features/${slug}`, en: `/features/${slug}` }, kicker: t("eyebrow") });
}

export default function FeaturePage({ params }: PageProps<"/[locale]/features/[slug]">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto my-16 h-[40rem] w-full max-w-6xl" />}>
      <Feature params={params} />
    </Suspense>
  );
}

async function Feature({ params }: Pick<PageProps<"/[locale]/features/[slug]">, "params">) {
  const { locale, slug } = await params;
  setRequestLocale(locale as Locale);
  if (!isFeature(slug)) notFound();
  const t = await getTranslations("site.nav");
  const related = featurePages.filter((s) => s !== slug).map((s) => ({ href: `/features/${s}`, label: t(`feature_${s}`) }));
  return <DetailPage namespace={`featureDetail.${slug}`} mockup={mockupFor[slug]} related={[...related, { href: "/pricing", label: t("pricing") }]} />;
}
