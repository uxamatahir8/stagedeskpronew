import { BuildingIcon, CalendarCheckIcon, MailCheckIcon, ReceiptIcon, UsersIcon } from "lucide-react";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { BookingStatus } from "@stagedesk/core";
import { adminDashboard } from "@stagedesk/db";
import { AreaTrend } from "@/components/charts/area-trend";
import { BarList } from "@/components/charts/bar-list";
import { Funnel } from "@/components/charts/funnel";
import { ShareBar } from "@/components/charts/share-bar";
import { TrendStat } from "@/components/charts/trend-stat";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { euro } from "@/lib/format";

/** Platform analytics: growth, booking value, plan mix and the lead pipeline. */
export async function AdminAnalytics() {
  const [t, tb, ts, tsup, format, locale, d] = await Promise.all([
    getTranslations("dashboards"),
    getTranslations("bookingStatus"),
    getTranslations("subStatus"),
    getTranslations("support"),
    getFormatter(),
    getLocale(),
    adminDashboard(),
  ]);
  const k = d.kpis;
  const vs = { vsLabel: t("vsLastMonth"), newLabel: t("new") };

  return (
    <section className="grid gap-6" aria-labelledby="admin-analytics">
      <div className="grid gap-1">
        <h2 id="admin-analytics" className="text-lg font-semibold">
          {t("analyticsTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("analyticsHint")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <TrendStat index={0} label={t("gmvMonth")} value={euro(format, k.gmv.current)} {...k.gmv} {...vs} spark={d.gmvByMonth.map((m) => m.value)} icon={ReceiptIcon} />
        <TrendStat index={1} label={t("newAgenciesMonth")} value={k.agencies.current} {...k.agencies} {...vs} icon={BuildingIcon} />
        <TrendStat index={2} label={t("newUsersMonth")} value={k.users.current} {...k.users} {...vs} spark={d.usersByMonth.map((m) => m.value)} icon={UsersIcon} />
        <TrendStat index={3} label={t("bookingsMonth")} value={k.bookings.current} {...k.bookings} {...vs} icon={CalendarCheckIcon} />
        <StatCard tone="blue" label={t("newsletter")} value={k.newsletter} hint={t("newsletterHint")} icon={MailCheckIcon} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("gmvTrend")}</CardTitle>
            <CardDescription>{t("gmvTrendHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <AreaTrend label={t("gmvTrend")} unit="cents" data={d.gmvByMonth} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("signupsTrend")}</CardTitle>
            <CardDescription>{t("signupsTrendHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <AreaTrend label={t("signupsTrend")} unit="count" data={d.usersByMonth} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("plansMix")}</CardTitle>
            <CardDescription>{t("plansMixHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ShareBar
              otherLabel={t("other")}
              empty={t("noData")}
              items={d.subscriptionsByPlan.map((p) => ({ key: p.key, label: p.name[locale] ?? p.name["en"] ?? p.key, value: p.value, display: String(p.value) }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("subscriptionStatus")}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList share empty={t("noData")} items={d.subscriptionsByStatus.sort((a, b) => b.value - a.value).map((s) => ({ key: s.key, label: ts.has(s.key as "active") ? ts(s.key as "active") : s.key, value: s.value }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("leadFunnel")}</CardTitle>
            <CardDescription>{t("leadFunnelHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Funnel
              conversionLabel={(pct) => t("conversion", { pct })}
              steps={[
                { key: "leads", label: t("stage_leads"), value: d.leadFunnel.total },
                { key: "offered", label: t("stage_offered"), value: d.leadFunnel.offered },
                { key: "assigned", label: t("stage_assigned"), value: d.leadFunnel.assigned },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("topAgencies")}</CardTitle>
            <CardDescription>{t("topAgenciesHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList empty={t("noData")} items={d.topAgencies.map((a) => ({ key: a.key, label: a.label, value: a.value, display: euro(format, a.value), href: `/app/agencies/${a.key}` }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("platformBookings")}</CardTitle>
            <CardDescription>{t("platformBookingsHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList share max={9} empty={t("noData")} items={d.bookingStatuses.sort((a, b) => b.value - a.value).map((s) => ({ key: s.key, label: tb(s.key as BookingStatus), value: s.value }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("support")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ShareBar
              otherLabel={t("other")}
              empty={t("noData")}
              items={d.tickets.map((s) => ({ key: s.key, label: tsup.has(`status_${s.key}` as "status_open") ? tsup(`status_${s.key}` as "status_open") : s.key, value: s.value, display: String(s.value) }))}
            />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
