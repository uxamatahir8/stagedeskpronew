import { BanknoteIcon, CalendarClockIcon, HandshakeIcon, PercentIcon, RepeatIcon, StoreIcon, TrophyIcon, WalletIcon } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import type { EventType, Permission } from "@stagedesk/core";
import { artistInsights, businessInsights, platformInsights } from "@stagedesk/db";
import { AreaTrend } from "@/components/charts/area-trend";
import { BarList } from "@/components/charts/bar-list";
import { ColumnChart } from "@/components/charts/column-chart";
import { Funnel } from "@/components/charts/funnel";
import { ShareBar } from "@/components/charts/share-bar";
import { WeekdayBars } from "@/components/charts/weekday-bars";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { euro } from "@/lib/format";

const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

function ChartCard({ title, hint, children, className }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {hint && <CardDescription>{hint}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Section({ id, title, hint, children }: { id: string; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-6" aria-labelledby={id}>
      <div className="grid gap-1">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      {children}
    </section>
  );
}

// ─── Platform admin ──────────────────────────────────────────────────────────

/** Money, the marketplace, growth, and where and when events happen. */
export async function AdminInsights() {
  const [t, tr, te, tb, tm, format, d] = await Promise.all([
    getTranslations("insights"),
    getTranslations("roles"),
    getTranslations("eventTypes"),
    getTranslations("adminBookings"),
    getTranslations("paymentMethods"),
    getFormatter(),
    platformInsights(),
  ]);
  const cash = (cents: number) => euro(format, cents);
  const m = d.market;

  return (
    <>
      <Section id="admin-money" title={t("moneyTitle")} hint={t("moneyHint")}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard index={0} tone="violet" label={t("mrrAgencies")} value={cash(d.mrr.agency)} hint={t("mrrHint")} icon={RepeatIcon} />
          <StatCard index={1} tone="pink" label={t("mrrArtists")} value={cash(d.mrr.artist)} hint={t("mrrHint")} icon={RepeatIcon} />
          <StatCard index={2} tone="teal" label={t("paid12")} value={cash(d.paidByMonth.reduce((s, x) => s + x.value, 0))} hint={t("paid12Hint")} icon={BanknoteIcon} />
          <StatCard index={3} tone="amber" label={t("fees12")} value={cash(d.feesByMonth.reduce((s, x) => s + x.value, 0))} hint={t("fees12Hint")} icon={WalletIcon} />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title={t("paidTrend")} hint={t("paidTrendHint")}>
            <AreaTrend label={t("paidTrend")} unit="cents" data={d.paidByMonth} />
          </ChartCard>
          <ChartCard title={t("feesTrend")} hint={t("feesTrendHint")}>
            <AreaTrend label={t("feesTrend")} unit="cents" data={d.feesByMonth} />
          </ChartCard>
        </div>
      </Section>

      <Section id="admin-market" title={t("marketTitle")} hint={t("marketHint")}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard index={0} tone="violet" label={t("requests12")} value={m.leads} hint={t("requests12Hint", { count: m.offered })} icon={StoreIcon} />
          <StatCard index={1} tone="teal" label={t("pricedRate")} value={pct(m.pricedRate)} hint={m.pricesPerLead === null ? t("noPrices") : t("pricesPerLead", { count: m.pricesPerLead })} icon={PercentIcon} />
          <StatCard index={2} tone="pink" label={t("winRate")} value={pct(m.winRate)} hint={t("winRateHint", { count: m.won })} icon={TrophyIcon} />
          <StatCard index={3} tone="amber" label={t("averageWon")} value={m.averageWon ? cash(m.averageWon) : "—"} hint={t("averageWonHint")} icon={HandshakeIcon} />
        </div>
        <div className="grid gap-6 lg:grid-cols-5">
          <ChartCard className="lg:col-span-3" title={t("marketTrend")} hint={t("marketTrendHint")}>
            <ColumnChart
              label={t("marketTrend")}
              unit="count"
              series={[
                { key: "leads", label: t("stage_requests"), color: "var(--chart-1)" },
                { key: "priced", label: t("stage_priced"), color: "var(--chart-2)" },
                { key: "won", label: t("stage_booked"), color: "var(--chart-3)" },
              ]}
              data={d.marketByMonth}
            />
          </ChartCard>
          <ChartCard className="lg:col-span-2" title={t("marketFunnel")} hint={t("marketFunnelHint")}>
            <Funnel
              conversionLabel={(p) => t("goOn", { pct: p })}
              steps={[
                { key: "leads", label: t("stage_requests"), value: m.leads },
                { key: "offered", label: t("stage_sent"), value: m.offered },
                { key: "priced", label: t("stage_priced"), value: m.priced },
                { key: "won", label: t("stage_booked"), value: m.won },
              ]}
            />
          </ChartCard>
        </div>
      </Section>

      <Section id="admin-growth" title={t("growthTitle")} hint={t("growthHint")}>
        <div className="grid gap-6 lg:grid-cols-2">
          <ChartCard title={t("signupsKind")} hint={t("signupsKindHint")}>
            <ColumnChart
              label={t("signupsKind")}
              unit="count"
              series={[
                { key: "agency", label: t("kind_agency"), color: "var(--chart-1)" },
                { key: "solo", label: t("kind_solo"), color: "var(--chart-4)" },
              ]}
              data={d.signupsByKind}
            />
          </ChartCard>
          <ChartCard title={t("gigOrders")} hint={t("gigOrdersHint")}>
            <AreaTrend label={t("gigOrders")} unit="count" data={d.gigOrdersByMonth} />
          </ChartCard>
        </div>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <ChartCard title={t("accounts")} hint={t("accountsHint")}>
            <ShareBar
              otherLabel={t("other")}
              empty={t("noData")}
              items={d.roles.map((r) => ({ key: r.key, label: r.key === "agency" ? t("role_agency") : r.key === "affiliate" ? t("role_affiliate") : tr(r.key as "customer"), value: r.value, display: format.number(r.value) }))}
            />
          </ChartCard>
          <ChartCard title={t("sources")} hint={t("last12")}>
            <ShareBar
              otherLabel={t("other")}
              empty={t("noData")}
              items={d.sources.map((s) => ({ key: s.key, label: tb.has(`source_${s.key}` as "source_manual") ? tb(`source_${s.key}` as "source_manual") : s.key, value: s.value, display: format.number(s.value) }))}
            />
          </ChartCard>
          <ChartCard title={t("lending")} hint={t("lendingHint")}>
            <dl className="grid gap-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("lendingRequests")}</dt>
                <dd className="font-semibold tabular-nums">{d.lending.requests}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("lendingAgreed")}</dt>
                <dd className="font-semibold tabular-nums">{d.lending.agreed}</dd>
              </div>
              <div className="flex justify-between border-t pt-3">
                <dt className="text-muted-foreground">{t("lendingFees")}</dt>
                <dd className="font-semibold tabular-nums">{cash(d.lending.feesAgreed)}</dd>
              </div>
            </dl>
          </ChartCard>
        </div>
      </Section>

      <Section id="admin-where" title={t("whereTitle")} hint={t("whereHint")}>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <ChartCard title={t("weekdays")} hint={t("weekdaysHint")}>
            <WeekdayBars label={t("weekdays")} data={d.weekdays} />
          </ChartCard>
          <ChartCard title={t("eventCities")} hint={t("last12")}>
            <BarList share empty={t("noData")} items={d.cities.map((c) => ({ key: c.key, label: c.key, value: c.value }))} />
          </ChartCard>
          <ChartCard title={t("agencyCities")} hint={t("agencyCitiesHint")}>
            <BarList share empty={t("noData")} items={d.agencyCities.map((c) => ({ key: c.key, label: c.key, value: c.value }))} />
          </ChartCard>
          <ChartCard title={t("eventTypes")} hint={t("last12")}>
            <BarList share empty={t("noData")} items={d.eventTypes.map((e) => ({ key: e.key, label: te(e.key as EventType), value: e.value }))} />
          </ChartCard>
          <ChartCard title={t("paymentMethods")} hint={t("paymentMethodsHint")}>
            <ShareBar
              otherLabel={t("other")}
              empty={t("noData")}
              items={d.paymentMethods.map((p) => ({ key: p.key, label: tm.has(p.key as "cash") ? tm(p.key as "cash") : p.key, value: p.value, display: cash(p.value) }))}
            />
          </ChartCard>
        </div>
      </Section>
    </>
  );
}

// ─── Agency or independent artist ────────────────────────────────────────────

/** The marketplace, quotes over time, collection, who earns most, weekdays and booking lead time. */
export async function BusinessInsights({ organizationId, permissions, currency, solo }: { organizationId: string; permissions: readonly Permission[]; currency: string; solo: boolean }) {
  const money = permissions.includes("agency.reports") && permissions.includes("agency.payments");
  const [t, format, d] = await Promise.all([getTranslations("insights"), getFormatter(), businessInsights(organizationId)]);
  const cash = (cents: number) => euro(format, cents, currency);
  const collectedPct = d.collected.total ? Math.round((d.collected.paid / d.collected.total) * 100) : null;

  return (
    <Section id="business-insights" title={t("businessTitle")} hint={t("businessHint")}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} tone="violet" label={t("requestsReceived")} value={d.market.received} hint={t("requestsReceivedHint", { priced: d.market.priced, passed: d.market.passed })} icon={StoreIcon} />
        <StatCard index={1} tone="pink" label={t("myWinRate")} value={pct(d.market.winRate)} hint={t("myWinRateHint", { won: d.market.won, lost: d.market.lost })} icon={TrophyIcon} />
        <StatCard index={2} tone="teal" label={t("leadTime")} value={d.leadTimeDays === null ? "—" : t("days", { count: d.leadTimeDays })} hint={t("leadTimeHint")} icon={CalendarClockIcon} />
        {money ? (
          <StatCard index={3} tone="amber" label={t("collectedRate")} value={pct(collectedPct)} hint={t("collectedRateHint", { paid: cash(d.collected.paid), total: cash(d.collected.total) })} icon={BanknoteIcon} />
        ) : (
          <StatCard index={3} tone="amber" label={t("direct")} value={d.direct.gigs + d.direct.profile} hint={t("directHint", { gigs: d.direct.gigs, profile: d.direct.profile })} icon={HandshakeIcon} />
        )}
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <ChartCard className="lg:col-span-3" title={t("quotesTrend")} hint={t("quotesTrendHint")}>
          <ColumnChart
            label={t("quotesTrend")}
            unit="count"
            series={[
              { key: "sent", label: t("quotesSent"), color: "var(--chart-1)" },
              { key: "accepted", label: t("quotesAccepted"), color: "var(--chart-2)" },
            ]}
            data={d.quotesByMonth}
          />
        </ChartCard>
        <ChartCard className="lg:col-span-2" title={t("myMarket")} hint={t("myMarketHint")}>
          <Funnel
            conversionLabel={(p) => t("goOn", { pct: p })}
            steps={[
              { key: "received", label: t("stage_received"), value: d.market.received },
              { key: "priced", label: t("stage_priced"), value: d.market.priced },
              { key: "won", label: t("stage_booked"), value: d.market.won },
            ]}
          />
        </ChartCard>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <ChartCard title={t("weekdays")} hint={t("myWeekdaysHint")}>
          <WeekdayBars label={t("weekdays")} data={d.weekdays} />
        </ChartCard>
        {solo ? (
          <ChartCard title={t("direct")} hint={t("directCardHint")}>
            <BarList
              empty={t("noData")}
              items={[
                { key: "gig", label: t("directGigs"), value: d.direct.gigs },
                { key: "profile", label: t("directProfile"), value: d.direct.profile },
              ]}
            />
          </ChartCard>
        ) : (
          <ChartCard title={t("byArtist")} hint={money ? t("byArtistHint") : t("byArtistGigsHint")}>
            <BarList
              empty={t("noData")}
              items={d.byArtist.map((a) => (money ? { key: a.key, label: a.label, value: a.value, display: `${cash(a.value)} · ${t("gigs", { count: a.gigs })}` } : { key: a.key, label: a.label, value: a.gigs }))}
            />
          </ChartCard>
        )}
      </div>
    </Section>
  );
}

// ─── Artist ──────────────────────────────────────────────────────────────────

/** When the artist plays, and how full the coming months are. */
export async function ArtistInsights({ userId }: { userId: string }) {
  const [t, d] = await Promise.all([getTranslations("insights"), artistInsights(userId)]);
  if (!d) return null;
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <ChartCard title={t("upcoming")} hint={t("upcomingHint")}>
        <ColumnChart label={t("upcoming")} unit="count" series={[{ key: "gigs", label: t("gigsLabel"), color: "var(--chart-1)" }]} data={d.upcoming.map((u) => ({ month: u.month, values: [u.value] }))} />
      </ChartCard>
      <ChartCard title={t("weekdays")} hint={t("artistWeekdaysHint")}>
        <WeekdayBars label={t("weekdays")} data={d.weekdays} />
      </ChartCard>
    </div>
  );
}
