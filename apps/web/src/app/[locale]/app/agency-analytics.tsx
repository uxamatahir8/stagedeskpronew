import { CalendarRangeIcon, EuroIcon, HandshakeIcon, InboxIcon, PercentIcon, ReceiptIcon, StarIcon, WalletIcon } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import type { EventType, Permission } from "@stagedesk/core";
import { agencyDashboard } from "@stagedesk/db";
import { AreaTrend } from "@/components/charts/area-trend";
import { BarList } from "@/components/charts/bar-list";
import { Funnel } from "@/components/charts/funnel";
import { ShareBar } from "@/components/charts/share-bar";
import { TrendStat } from "@/components/charts/trend-stat";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { euro } from "@/lib/format";

/** The agency's analytics: how the business is doing over the last year. */
export async function AgencyAnalytics({ organizationId, permissions, currency }: { organizationId: string; permissions: readonly Permission[]; currency: string }) {
  const money = permissions.includes("agency.reports") && permissions.includes("agency.payments");
  const [t, te, tm, format, d] = await Promise.all([
    getTranslations("dashboards"),
    getTranslations("eventTypes"),
    getTranslations("paymentMethods"),
    getFormatter(),
    agencyDashboard(organizationId),
  ]);
  const k = d.kpis;
  const cash = (cents: number) => euro(format, cents, currency);
  const vs = { vsLabel: t("vsLastMonth"), newLabel: t("new") };

  return (
    <section className="grid gap-6" aria-labelledby="agency-analytics">
      <div className="grid gap-1">
        <h2 id="agency-analytics" className="text-lg font-semibold">
          {t("analyticsTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("analyticsHint")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <TrendStat index={0} label={t("inquiriesMonth")} value={k.inquiries.current} {...k.inquiries} {...vs} spark={d.inquiriesByMonth.map((m) => m.value)} icon={InboxIcon} />
        <TrendStat index={1} label={t("wonMonth")} value={k.won.current} {...k.won} {...vs} spark={d.wonByMonth.map((m) => m.value)} icon={HandshakeIcon} />
        {money && <TrendStat index={2} label={t("bookedMonth")} value={cash(k.booked.current)} {...k.booked} {...vs} icon={ReceiptIcon} />}
        {money && <TrendStat index={3} label={t("collectedMonth")} value={cash(k.collected.current)} {...k.collected} {...vs} icon={EuroIcon} />}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="teal"
          label={t("quoteAcceptance")}
          value={k.conversion === null ? "—" : `${k.conversion}%`}
          hint={t("quoteAcceptanceHint", { accepted: k.quotesAccepted, sent: k.quotesSent })}
          icon={PercentIcon}
        />
        {money && <StatCard tone="violet" label={t("averageValue")} value={cash(k.averageValue)} hint={t("averageValueHint")} icon={StarIcon} />}
        {money && <StatCard tone="amber" label={t("outstanding")} value={cash(k.outstanding.cents)} hint={t("outstandingHint", { count: k.outstanding.bookings })} icon={WalletIcon} />}
        <StatCard
          tone="blue"
          label={t("next30")}
          value={money ? cash(k.next30.cents) : k.next30.bookings}
          hint={t("next30Hint", { count: k.next30.bookings })}
          icon={CalendarRangeIcon}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{t("inquiriesTrend")}</CardTitle>
            <CardDescription>{t("inquiriesTrendHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <AreaTrend label={t("inquiriesTrend")} unit="count" data={d.inquiriesByMonth} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("pipeline")}</CardTitle>
            <CardDescription>{t("pipelineHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Funnel
              conversionLabel={(pct) => t("conversion", { pct })}
              steps={(["inquiries", "quoted", "booked", "done"] as const).map((s) => ({ key: s, label: t(`stage_${s}`), value: d.funnel[s] }))}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("eventTypes")}</CardTitle>
            <CardDescription>{t("eventTypesHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList share empty={t("noData")} items={d.eventTypes.sort((a, b) => b.value - a.value).map((e) => ({ key: e.key, label: te(e.key as EventType), value: e.value }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("sources")}</CardTitle>
            <CardDescription>{t("sourcesHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ShareBar
              otherLabel={t("other")}
              empty={t("noData")}
              items={d.sources.map((s) => ({ key: s.key, label: t.has(`source_${s.key}` as "source_manual") ? t(`source_${s.key}` as "source_manual") : s.key, value: s.value, display: String(s.value) }))}
            />
          </CardContent>
        </Card>
        {money ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("paymentMethods")}</CardTitle>
              <CardDescription>{t("paymentMethodsHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ShareBar
                otherLabel={t("other")}
                empty={t("noData")}
                items={d.paymentMethods.map((m) => ({ key: m.key, label: tm.has(m.key as "cash") ? tm(m.key as "cash") : m.key, value: m.value, display: cash(m.value) }))}
              />
            </CardContent>
          </Card>
        ) : (
          <Reviews d={d} t={t} format={format} />
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {money && (
          <Card>
            <CardHeader>
              <CardTitle>{t("topCustomers")}</CardTitle>
              <CardDescription>{t("topCustomersHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              <BarList empty={t("noData")} items={d.topCustomers.map((c) => ({ key: c.key, label: c.label, value: c.value, display: cash(c.value) }))} />
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>{t("cities")}</CardTitle>
            <CardDescription>{t("citiesHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList share empty={t("noData")} items={d.cities.map((c) => ({ key: c.key, label: c.key, value: c.value }))} />
          </CardContent>
        </Card>
        {money && <Reviews d={d} t={t} format={format} />}
      </div>
    </section>
  );
}

/** Average stars and how the ratings spread, one bar per star level. */
function Reviews({ d, t, format }: { d: Awaited<ReturnType<typeof agencyDashboard>>; t: Awaited<ReturnType<typeof getTranslations<"dashboards">>>; format: Awaited<ReturnType<typeof getFormatter>> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("reviews")}</CardTitle>
        <CardDescription>{t("reviewsHint", { count: d.rating.count })}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {d.rating.average === null ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("noReviews")}</p>
        ) : (
          <>
            <p className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">{format.number(d.rating.average, { maximumFractionDigits: 1 })}</span>
              <span className="text-warning" aria-hidden>
                {"★".repeat(Math.round(d.rating.average))}
                <span className="text-muted-foreground/40">{"★".repeat(5 - Math.round(d.rating.average))}</span>
              </span>
            </p>
            <BarList share empty={t("noReviews")} items={d.rating.byStars.map((s) => ({ key: String(s.stars), label: t("stars", { count: s.stars }), value: s.count }))} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
