import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { countLimits, featureFlags, feeRuleSchema, type FeeRule } from "@stagedesk/core";
import { PageIntro } from "@/components/site/page-intro";
import { primaryCta } from "@/components/site/site-chrome";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { euro, percent } from "@/lib/format";
import { jsonLd, pageMetadata } from "@/lib/seo";
import { sitePlans, siteSettings } from "@/lib/site";
import { type PricingCard, PricingCards } from "./pricing-cards";

export async function generateMetadata({ params }: PageProps<"/[locale]/pricing">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "pricingPage" });
  return pageMetadata({ locale, title: t("title"), description: t("intro"), paths: { nl: "/pricing", en: "/pricing" }, kicker: t("eyebrow") });
}

export default async function PricingPage({ params }: PageProps<"/[locale]/pricing">) {
  setRequestLocale((await params).locale as Locale);
  const t = await getTranslations("pricingPage");
  return (
    <main className="mx-auto grid w-full max-w-[88rem] gap-12 px-5 py-16 sm:px-8 lg:px-12 sm:py-20">
      <PageIntro eyebrow={t("eyebrow")} title={t("title")} intro={t("intro")} />
      <Suspense fallback={<Skeleton className="h-[32rem] w-full" />}>
        <Plans />
      </Suspense>
      <section className="grid gap-4 rounded-2xl border bg-muted/30 p-6 sm:p-8">
        <h2 className="text-xl font-semibold">{t("feeTitle")}</h2>
        <p className="max-w-3xl text-muted-foreground">{t("feeBody")}</p>
      </section>
    </main>
  );
}

async function Plans() {
  await connection();
  const [t, tb, format, locale, plans, cta, { fees }] = await Promise.all([
    getTranslations("pricingPage"),
    getTranslations("billing"),
    getFormatter(),
    getLocale(),
    sitePlans(),
    primaryCta(),
    siteSettings(),
  ]);
  if (plans.length === 0) return <p className="text-muted-foreground">{t("noPlans")}</p>;

  const describeFee = (rule: FeeRule) => {
    if (rule.type === "none") return t("feeNone");
    const parts = [];
    if (rule.type === "percentage" || rule.type === "percentage_plus_fixed") parts.push(percent(format, rule.percentageBps));
    if (rule.type === "fixed" || rule.type === "percentage_plus_fixed") parts.push(euro(format, rule.fixedCents));
    return t("feeLine", { fee: parts.join(" + ") });
  };
  const loc = (v: Record<string, string>) => v[locale] ?? v["nl"] ?? "";

  const cards: PricingCard[] = plans.map((p) => {
    const planFee = feeRuleSchema.safeParse(p.feeRule);
    const yearlyPerMonth = Math.round(p.yearlyPriceCents / 12);
    const savings = p.monthlyPriceCents * 12 - p.yearlyPriceCents;
    const features = (p.features[locale] ?? p.features["nl"] ?? []).filter(Boolean);
    // Limit names are capitalised labels; mid-sentence they read lowercase ("Up to 3 active artists").
    const what = (k: (typeof countLimits)[number]) => tb(`limit_${k}`).toLocaleLowerCase(locale);
    const generated = [
      ...countLimits.filter((k) => k !== "storageGb").map((k) => (p.limits[k] === null ? t("unlimited", { what: what(k) }) : t("upTo", { count: p.limits[k]!, what: what(k) }))),
      ...featureFlags.filter((f) => p.limits[f]).map((f) => tb(`flag_${f}`)),
    ];
    return {
      key: p.key,
      name: loc(p.name),
      description: loc(p.description),
      monthly: euro(format, p.monthlyPriceCents),
      yearly: euro(format, p.yearlyPriceCents),
      yearlyPerMonth: euro(format, yearlyPerMonth),
      savings: savings > 0 ? euro(format, savings) : null,
      // The admin's own feature list wins; without one, the list comes from the plan's limits.
      features: [...new Set(features)],
      limits: features.length > 0 ? [] : generated,
      fee: describeFee(p.feeRule && planFee.success ? planFee.data : fees.defaultRule),
      recommended: p.recommended,
    };
  });

  return (
    <>
      <PricingCards plans={cards} cta={cta} trialDays={Math.max(0, ...plans.map((p) => p.trialDays))} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd({
          "@type": "SoftwareApplication",
          name: "StageDesk",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          offers: plans.map((p) => ({ "@type": "Offer", name: loc(p.name), price: (p.monthlyPriceCents / 100).toFixed(2), priceCurrency: "EUR" })),
        })}
      />
    </>
  );
}
