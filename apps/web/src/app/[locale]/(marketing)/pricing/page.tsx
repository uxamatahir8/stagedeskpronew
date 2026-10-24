import { CheckIcon, MinusIcon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { convertCents, countLimits, featureFlags, feeRuleSchema, type FeeRule } from "@stagedesk/core";
import { container, CtaBand, FaqList, Proofs, SectionHeading } from "@/components/site/marketing-blocks";
import { primaryCta } from "@/components/site/site-chrome";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { displayCurrency, siteRates } from "@/lib/display-currency";
import { euro, percent } from "@/lib/format";
import { jsonLd, pageMetadata } from "@/lib/seo";
import { sitePlans, siteSettings } from "@/lib/site";
import { cn } from "@/lib/utils";
import { type PricingCard, PricingCards } from "./pricing-cards";

export async function generateMetadata({ params }: PageProps<"/[locale]/pricing">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "pricingPage" });
  return pageMetadata({ locale, title: t("title"), description: t("intro"), paths: { nl: "/pricing", en: "/pricing" }, kicker: t("eyebrow") });
}

/** The booking amount used in the worked fee example. */
const EXAMPLE_CENTS = 150_000;

export default async function PricingPage({ params }: PageProps<"/[locale]/pricing">) {
  setRequestLocale((await params).locale as Locale);
  const t = await getTranslations("pricingPage");
  const faq = ([1, 2, 3, 4, 5, 6] as const).map((i) => ({ q: t(`faq${i}Q`), a: t(`faq${i}A`) }));
  return (
    <main>
      <section className="border-b bg-muted/30">
        <div className={`${container} grid justify-items-center gap-5 py-16 text-center sm:py-20`}>
          <p className="text-sm font-medium text-primary">{t("eyebrow")}</p>
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-5xl">{t("title")}</h1>
          <p className="max-w-2xl text-lg text-muted-foreground">{t("intro")}</p>
          <Proofs items={[t("proof1"), t("proof2"), t("proof3"), t("proof4")]} className="justify-center" />
        </div>
      </section>

      <section className={`${container} -mt-2 py-14`}>
        <Suspense fallback={<Skeleton className="h-[36rem] w-full" />}>
          <Plans />
        </Suspense>
      </section>

      <section className="border-t">
        <div className={`${container} grid gap-10 py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-16`}>
          <div className="grid content-start gap-6">
            <SectionHeading title={t("includedTitle")} />
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {([1, 2, 3, 4, 5, 6, 7, 8] as const).map((i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success/15 text-success">
                    <CheckIcon className="size-3.5" aria-hidden />
                  </span>
                  {t(`included${i}`)}
                </li>
              ))}
            </ul>
          </div>
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <FeeExample />
          </Suspense>
        </div>
      </section>

      <section className="border-t bg-muted/30">
        <div className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-20 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight">{t("faqTitle")}</h2>
          <FaqList items={faq} />
          <Link href="/contact" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            {t("contactSales")}
          </Link>
        </div>
      </section>

      <Suspense fallback={null}>
        <CtaBand title={t("ctaTitle")} body={t("ctaBody")} />
      </Suspense>
    </main>
  );
}

function feeCents(rule: FeeRule, amount: number) {
  if (rule.type === "none") return 0;
  const pct = rule.type === "percentage" || rule.type === "percentage_plus_fixed" ? Math.round((amount * rule.percentageBps) / 10_000) : 0;
  const fixed = rule.type === "fixed" || rule.type === "percentage_plus_fixed" ? rule.fixedCents : 0;
  return pct + fixed;
}

async function Plans() {
  await connection();
  const [t, tb, format, locale, plans, cta, { fees }, shown, { rates, date }] = await Promise.all([
    getTranslations("pricingPage"),
    getTranslations("billing"),
    getFormatter(),
    getLocale(),
    sitePlans(),
    primaryCta(),
    siteSettings(),
    displayCurrency(),
    siteRates(),
  ]);
  // Prices are euros; a visitor who picked another currency sees an estimate at the ECB rate.
  const converted = shown !== "EUR" && convertCents(100, "EUR", shown, rates) !== null;
  const money = (cents: number) => (converted ? euro(format, convertCents(cents, "EUR", shown, rates)!, shown) : euro(format, cents));
  if (plans.length === 0) return <p className="text-muted-foreground">{t("noPlans")}</p>;

  const ruleOf = (p: (typeof plans)[number]) => {
    const planFee = feeRuleSchema.safeParse(p.feeRule);
    return p.feeRule && planFee.success ? planFee.data : fees.defaultRule;
  };
  const describeFee = (rule: FeeRule, short = false) => {
    if (rule.type === "none") return short ? "—" : t("feeNone");
    const parts = [];
    if (rule.type === "percentage" || rule.type === "percentage_plus_fixed") parts.push(percent(format, rule.percentageBps));
    if (rule.type === "fixed" || rule.type === "percentage_plus_fixed") parts.push(money(rule.fixedCents));
    return short ? parts.join(" + ") : t("feeLine", { fee: parts.join(" + ") });
  };
  const loc = (v: Record<string, string>) => v[locale] ?? v["nl"] ?? "";
  // Limit names are capitalised labels; mid-sentence they read lowercase ("Up to 3 active artists").
  const what = (k: (typeof countLimits)[number]) => tb(`limit_${k}`).toLocaleLowerCase(locale);

  const cards: PricingCard[] = plans.map((p) => {
    const yearlyPerMonth = Math.round(p.yearlyPriceCents / 12);
    const savings = p.monthlyPriceCents * 12 - p.yearlyPriceCents;
    const features = (p.features[locale] ?? p.features["nl"] ?? []).filter(Boolean);
    const generated = [
      ...countLimits.filter((k) => k !== "storageGb").map((k) => (p.limits[k] === null ? t("unlimited", { what: what(k) }) : t("upTo", { count: p.limits[k]!, what: what(k) }))),
      ...featureFlags.filter((f) => p.limits[f]).map((f) => tb(`flag_${f}`)),
    ];
    return {
      key: p.key,
      name: loc(p.name),
      description: loc(p.description),
      monthly: money(p.monthlyPriceCents),
      yearly: money(p.yearlyPriceCents),
      yearlyPerMonth: money(yearlyPerMonth),
      savings: savings > 0 ? money(savings) : null,
      billedInEuro: converted ? t("billedInEuro", { amount: euro(format, p.monthlyPriceCents) }) : null,
      savingsPercent: p.monthlyPriceCents > 0 && savings > 0 ? Math.round((savings / (p.monthlyPriceCents * 12)) * 100) : 0,
      // The admin's own feature list wins; without one, the list comes from the plan's limits.
      features: [...new Set(features)],
      limits: features.length > 0 ? [] : generated,
      fee: describeFee(ruleOf(p)),
      recommended: p.recommended,
    };
  });

  const cell = "px-4 py-3 text-center tabular-nums";
  return (
    <div className="grid gap-20">
      <PricingCards plans={cards} cta={cta} trialDays={Math.max(0, ...plans.map((p) => p.trialDays))} />
      {converted && <p className="-mt-14 text-center text-sm text-muted-foreground">{t("convertedNote", { currency: shown, date: date ? format.dateTime(new Date(`${date}T12:00:00Z`), { day: "numeric", month: "long", year: "numeric" }) : "" })}</p>}

      <div className="grid gap-8">
        <SectionHeading title={t("compareTitle")} intro={t("compareIntro")} />
        <div className="overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full min-w-[40rem] text-sm">
            <caption className="sr-only">{t("compareTitle")}</caption>
            <thead>
              <tr className="border-b bg-muted/40">
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  {t("compareFeature")}
                </th>
                {plans.map((p) => (
                  <th key={p.id} scope="col" className={cn(cell, "font-semibold", p.recommended && "text-primary")}>
                    {loc(p.name)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              <tr>
                <th scope="row" className="px-4 py-3 text-left font-medium">
                  {t("priceRow")}
                </th>
                {plans.map((p) => (
                  <td key={p.id} className={cn(cell, "font-semibold")}>
                    {money(p.monthlyPriceCents)}
                  </td>
                ))}
              </tr>
              {countLimits.map((k) => (
                <tr key={k}>
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    {tb(`limit_${k}`)}
                  </th>
                  {plans.map((p) => (
                    <td key={p.id} className={cell}>
                      {p.limits[k] === null ? t("unlimitedShort") : p.limits[k]}
                    </td>
                  ))}
                </tr>
              ))}
              {featureFlags.map((f) => (
                <tr key={f}>
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    {tb(`flag_${f}`)}
                  </th>
                  {plans.map((p) => (
                    <td key={p.id} className={cell}>
                      {p.limits[f] ? (
                        <CheckIcon className="mx-auto size-4 text-success" aria-label={t("included")} />
                      ) : (
                        <MinusIcon className="mx-auto size-4 text-muted-foreground/50" aria-label={t("notIncluded")} />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <th scope="row" className="px-4 py-3 text-left font-normal">
                  {t("feeRow")}
                </th>
                {plans.map((p) => (
                  <td key={p.id} className={cell}>
                    {describeFee(ruleOf(p), true)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

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
    </div>
  );
}

/** What the platform fee comes to on a real booking, with the recommended plan's rule. */
async function FeeExample() {
  await connection();
  const [t, format, plans, { fees }, shown, { rates }] = await Promise.all([getTranslations("pricingPage"), getFormatter(), sitePlans(), siteSettings(), displayCurrency(), siteRates()]);
  const converted = shown !== "EUR" && convertCents(100, "EUR", shown, rates) !== null;
  const money = (cents: number) => (converted ? euro(format, convertCents(cents, "EUR", shown, rates)!, shown) : euro(format, cents));
  const plan = plans.find((p) => p.recommended) ?? plans[0];
  const parsed = plan ? feeRuleSchema.safeParse(plan.feeRule) : null;
  const rule = plan?.feeRule && parsed?.success ? parsed.data : fees.defaultRule;
  const fee = feeCents(rule, EXAMPLE_CENTS);
  return (
    <div className="grid content-start gap-5 rounded-2xl border bg-card p-6 sm:p-8">
      <h2 className="text-2xl font-bold tracking-tight">{t("feeTitle")}</h2>
      <p className="text-muted-foreground">{t("feeBody")}</p>
      <div className="grid gap-3 rounded-xl bg-muted/50 p-5">
        <p className="text-sm font-semibold">{t("feeExampleTitle")}</p>
        {fee === 0 ? (
          <p className="text-sm text-muted-foreground">{t("feeExampleNone")}</p>
        ) : (
          <>
            <dl className="grid gap-1.5 text-sm tabular-nums">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t("feeExampleBooking")}</dt>
                <dd>{money(EXAMPLE_CENTS)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t("feeExampleFee")}</dt>
                <dd>− {money(fee)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t pt-1.5 font-semibold">
                <dt>{t("feeExampleRest")}</dt>
                <dd>{money(EXAMPLE_CENTS - fee)}</dd>
              </div>
            </dl>
            <p className="text-sm text-muted-foreground">{t("feeExampleBody", { amount: money(EXAMPLE_CENTS), fee: money(fee) })}</p>
          </>
        )}
        <p className="text-sm text-muted-foreground">{t("feeExampleOffline")}</p>
      </div>
    </div>
  );
}
