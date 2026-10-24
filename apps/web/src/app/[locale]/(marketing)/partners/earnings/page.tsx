import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { getSetting } from "@stagedesk/db";
import { SectionHeading } from "@/components/site/marketing-blocks";
import { PartnersNav } from "@/components/site/partners-nav";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { percent } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";
import { sitePlans } from "@/lib/site";
import { EarningsCalculator } from "./calculator";

export async function generateMetadata({ params }: PageProps<"/[locale]/partners/earnings">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "partnerPages" });
  return pageMetadata({ locale, title: t("earningsMeta"), description: t("earningsMetaDescription"), paths: { nl: "/partners/earnings", en: "/partners/earnings" }, kicker: t("earningsEyebrow") });
}

export default async function EarningsPage({ params }: PageProps<"/[locale]/partners/earnings">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-14 px-4 py-12 sm:px-6 sm:py-16">
      <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
        <Earnings />
      </Suspense>
    </main>
  );
}

/** The program's real rate, period, plans and levels, with a calculator. */
async function Earnings() {
  await connection();
  const [t, tp, format, locale, program, plans] = await Promise.all([
    getTranslations("partnerPages"),
    getTranslations("partners"),
    getFormatter(),
    getLocale(),
    getSetting("affiliates.program"),
    sitePlans(),
  ]);
  const months = program.commissionMonths === null ? tp("lifetime") : tp("months", { count: program.commissionMonths });
  const tiers = [...program.tiers].sort((a, b) => a.minPayingAgencies - b.minPayingAgencies);
  return (
    <>
      <PartnersNav current="earnings" />
      <header className="grid max-w-3xl gap-4">
        <p className="text-sm font-medium text-primary">{t("earningsEyebrow")}</p>
        <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">{t("earningsTitle")}</h1>
        <p className="text-lg text-muted-foreground">{t("earningsIntro", { rate: percent(format, program.commissionBps), months })}</p>
      </header>
      <EarningsCalculator
        plans={plans.filter((p) => p.monthlyPriceCents > 0).map((p) => ({ key: p.key, name: p.name[locale] ?? p.name["nl"] ?? p.key, monthlyCents: p.monthlyPriceCents }))}
        rateBps={program.commissionBps}
        months={program.commissionMonths}
      />
      {tiers.length > 0 && (
        <section className="grid gap-6">
          <SectionHeading title={t("tiersTitle")} intro={t("tiersIntro")} />
          <div className="grid gap-4 sm:grid-cols-3">
            {tiers.map((tier, i) => (
              <article key={tier.name} className={`grid content-start gap-2 rounded-2xl border p-6 ${i === tiers.length - 1 ? "border-primary/40 bg-primary/5" : "bg-card"}`}>
                <h3 className="text-lg font-semibold">{tier.name}</h3>
                <p className="text-4xl font-bold tracking-tight tabular-nums">{percent(format, tier.commissionBps)}</p>
                <p className="text-sm text-muted-foreground">{tp("tierAgencies", { count: tier.minPayingAgencies })}</p>
                {tier.perks && <p className="text-sm">{tier.perks}</p>}
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
