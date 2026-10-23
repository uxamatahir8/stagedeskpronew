import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { getSetting } from "@stagedesk/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { euro, percent } from "@/lib/format";
import { appUrl } from "@/lib/mail";
import { turnstileSiteKey } from "@/lib/turnstile";
import { getViewer } from "@/lib/viewer";
import { ApplyForm } from "./apply-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/partners">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "partners" });
  return { title: t("metaTitle"), description: t("metaDescription") };
}

export default async function PartnersPage({ params }: PageProps<"/[locale]/partners">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <main className="mx-auto grid w-full max-w-5xl gap-12 px-4 py-12 sm:py-16">
      <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
        <Partners />
      </Suspense>
    </main>
  );
}

async function Partners() {
  await connection();
  const [t, format, program, viewer] = await Promise.all([getTranslations("partners"), getFormatter(), getSetting("affiliates.program"), getViewer()]);
  const months = program.commissionMonths === null ? t("lifetime") : t("months", { count: program.commissionMonths });
  const steps = ["step1", "step2", "step3", "step4"] as const;

  return (
    <>
      <header className="grid max-w-2xl gap-4">
        <p className="text-sm font-semibold tracking-wider text-primary uppercase">{t("eyebrow")}</p>
        <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">{t("title")}</h1>
        <p className="text-lg text-muted-foreground">{t("intro")}</p>
      </header>

      <dl className="grid gap-4 sm:grid-cols-3">
        <Fact label={t("factCommission")} value={percent(format, program.commissionBps)} hint={t("factCommissionHint", { months })} />
        <Fact
          label={t("factDiscount")}
          value={program.promoDiscountBps > 0 ? percent(format, program.promoDiscountBps) : "—"}
          hint={t("factDiscountHint", { months: program.promoDiscountMonths })}
        />
        <Fact label={t("factPayout")} value={euro(format, program.minPayoutCents)} hint={t("factPayoutHint", { day: program.payoutDayOfMonth, days: program.approvalDays })} />
      </dl>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="grid content-start gap-8">
          <section className="grid gap-4">
            <h2 className="text-xl font-semibold">{t("howTitle")}</h2>
            <ol className="grid gap-4">
              {steps.map((s, i) => (
                <li key={s} className="grid grid-cols-[2rem_1fr] gap-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary/12 text-sm font-semibold text-primary tabular-nums">{i + 1}</span>
                  <div className="grid gap-1">
                    <p className="font-medium">{t(`${s}Title`)}</p>
                    <p className="text-sm text-muted-foreground">{t(`${s}Body`, { days: program.cookieDays, approval: program.approvalDays })}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {program.tiers.length > 0 && (
            <section className="grid gap-3">
              <h2 className="text-xl font-semibold">{t("tiersTitle")}</h2>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">{t("tier")}</th>
                      <th className="px-4 py-2 font-medium">{t("tierFrom")}</th>
                      <th className="px-4 py-2 text-right font-medium">{t("tierRate")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {program.tiers.map((tier) => (
                      <tr key={tier.name} className="border-t">
                        <td className="px-4 py-2">
                          <div className="font-medium">{tier.name}</div>
                          {tier.perks && <div className="text-xs text-muted-foreground">{tier.perks}</div>}
                        </td>
                        <td className="px-4 py-2 tabular-nums">{t("tierAgencies", { count: tier.minPayingAgencies })}</td>
                        <td className="px-4 py-2 text-right font-medium tabular-nums">{percent(format, tier.commissionBps)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <Card id="apply" className="content-start">
          <CardHeader>
            <CardTitle>{t("applyTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {program.enabled ? (
              <ApplyForm signedInAs={viewer?.user.email ?? null} turnstileKey={turnstileSiteKey()} linkBase={`${appUrl}/`} />
            ) : (
              <p className="text-sm text-muted-foreground">{t("closed")}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="grid gap-1 rounded-xl border bg-card p-5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-3xl font-semibold tracking-tight tabular-nums">{value}</dd>
      <dd className="text-sm text-muted-foreground">{hint}</dd>
    </div>
  );
}
