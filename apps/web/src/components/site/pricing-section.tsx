import "server-only";
import { ArrowRightIcon } from "lucide-react";
import { connection } from "next/server";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { convertCents, countLimits, featureFlags, type FeeRule, feeRuleSchema } from "@stagedesk/core";
import { type PricingCard, PricingCards } from "@/app/[locale]/(marketing)/pricing/pricing-cards";
import { Link } from "@/i18n/navigation";
import { displayCurrency, siteRates } from "@/lib/display-currency";
import { euro, percent } from "@/lib/format";
import { sitePlans, siteSettings } from "@/lib/site";
import { primaryCta } from "./site-chrome";

/**
 * The plans as the website shows them, in the visitor's chosen currency
 * (an estimate; billing is in euros). Shared by the pricing, home and about pages.
 */
export async function buildPricing() {
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
  const converted = shown !== "EUR" && convertCents(100, "EUR", shown, rates) !== null;
  const money = (cents: number) => (converted ? euro(format, convertCents(cents, "EUR", shown, rates)!, shown) : euro(format, cents));
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
      trialDays: p.trialDays,
    };
  });
  const convertedNote = converted
    ? t("convertedNote", { currency: shown, date: date ? format.dateTime(new Date(`${date}T12:00:00Z`), { day: "numeric", month: "long", year: "numeric" }) : "" })
    : null;
  return { t, format, plans, cards, cta, trialDays: Math.max(0, ...plans.map((p) => p.trialDays)), convertedNote, money, describeFee, ruleOf, loc };
}

/** The plan cards with a heading and a link to the full comparison. */
export async function PricingSection({ title, intro }: { title: string; intro: string }) {
  const { t, cards, cta, trialDays, convertedNote } = await buildPricing();
  if (cards.length === 0) return null;
  return (
    <div className="grid gap-10">
      <div className="grid justify-items-center gap-3 text-center">
        <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-balance sm:text-[2.1rem]">{title}</h2>
        <p className="max-w-2xl text-lg text-muted-foreground">{intro}</p>
      </div>
      <PricingCards plans={cards} cta={cta} trialDays={trialDays} />
      {convertedNote && <p className="-mt-6 text-center text-sm text-muted-foreground">{convertedNote}</p>}
      <Link href="/pricing" className="mx-auto flex w-fit items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
        {t("compareLink")}
        <ArrowRightIcon className="size-4" aria-hidden />
      </Link>
    </div>
  );
}
