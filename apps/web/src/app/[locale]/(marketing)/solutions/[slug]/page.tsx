import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DetailPage } from "@/components/site/detail-page";
import { Skeleton } from "@/components/ui/skeleton";
import { type Locale, routing } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";

/** Pages per kind of agency. Add one: a slug here and featureDetail.<slug> in both message files. */
const solutions = ["weddings-events", "band-agencies"] as const;
type SolutionSlug = (typeof solutions)[number];
const isSolution = (slug: string): slug is SolutionSlug => (solutions as readonly string[]).includes(slug);

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => solutions.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/solutions/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isSolution(slug)) return {};
  const t = await getTranslations({ locale: locale as Locale, namespace: `featureDetail.${slug}` as "featureDetail.weddings-events" });
  return pageMetadata({ locale: locale as Locale, title: t("metaTitle"), description: t("metaDescription"), paths: { nl: `/solutions/${slug}`, en: `/solutions/${slug}` }, kicker: t("eyebrow") });
}

export default function SolutionPage({ params }: PageProps<"/[locale]/solutions/[slug]">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto my-16 h-[40rem] w-full max-w-6xl" />}>
      <Solution params={params} />
    </Suspense>
  );
}

async function Solution({ params }: Pick<PageProps<"/[locale]/solutions/[slug]">, "params">) {
  const { locale, slug } = await params;
  setRequestLocale(locale as Locale);
  if (!isSolution(slug)) notFound();
  const t = await getTranslations("site.nav");
  return (
    <DetailPage
      namespace={`featureDetail.${slug}`}
      mockup={slug === "weddings-events" ? "form" : "artist"}
      screenshot={slug === "weddings-events" ? "customer" : "calendar"}
      related={[
        { href: "/features/quotes-invoices", label: t("feature_quotes-invoices") },
        { href: "/features/payments-payouts", label: t("feature_payments-payouts") },
        { href: "/for-agencies", label: t("forAgencies") },
        { href: "/pricing", label: t("pricing") },
      ]}
    />
  );
}
