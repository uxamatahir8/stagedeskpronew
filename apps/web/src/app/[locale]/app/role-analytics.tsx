import { CheckCircle2Icon, CircleIcon, PercentIcon, StarIcon } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import type { EventType } from "@stagedesk/core";
import { affiliateDashboard, artistDashboard, type TenantDb } from "@stagedesk/db";
import { AreaTrend } from "@/components/charts/area-trend";
import { BarList } from "@/components/charts/bar-list";
import { ShareBar } from "@/components/charts/share-bar";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { euro } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Artist analytics: earnings and gigs over the year, how often they say yes, ratings, event mix. */
export async function ArtistAnalytics({ userId }: { userId: string }) {
  const [t, te, format, d] = await Promise.all([getTranslations("dashboards"), getTranslations("eventTypes"), getFormatter(), artistDashboard(userId)]);
  if (!d) return null;
  return (
    <section className="grid gap-6" aria-labelledby="artist-analytics">
      <div className="grid gap-1">
        <h2 id="artist-analytics" className="text-lg font-semibold">
          {t("analyticsTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("analyticsHint")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard tone="teal" label={t("acceptRate")} value={d.acceptRate === null ? "—" : `${d.acceptRate}%`} hint={t("acceptRateHint")} icon={PercentIcon} />
        <StatCard
          tone="amber"
          label={t("rating")}
          value={d.rating.average === null ? "—" : `${format.number(d.rating.average, { maximumFractionDigits: 1 })} ★`}
          hint={t("ratingHint", { count: d.rating.count })}
          icon={StarIcon}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("earningsTrend")}</CardTitle>
            <CardDescription>{t("earningsTrendHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <AreaTrend label={t("earningsTrend")} unit="cents" data={d.earningsByMonth} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("gigsTrend")}</CardTitle>
            <CardDescription>{t("gigsTrendHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <AreaTrend label={t("gigsTrend")} unit="count" data={d.gigsByMonth} />
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("eventTypes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ShareBar otherLabel={t("other")} empty={t("noData")} items={d.eventTypes.map((e) => ({ key: e.key, label: te(e.key as EventType), value: e.value, display: String(e.value) }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("agencies")}</CardTitle>
            <CardDescription>{t("agenciesHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <BarList share empty={t("noData")} items={d.agencies.map((a) => ({ key: a.key, label: a.key, value: a.value }))} />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

/** Customer: a checklist for the next event and how much of each booking is paid. */
export async function CustomerProgress({ db, userId }: { db: TenantDb; userId: string }) {
  const [t, te, format] = await Promise.all([getTranslations("dashboards"), getTranslations("eventTypes"), getFormatter()]);
  const bookings = await db.booking.findMany({
    where: { customerId: userId, status: { notIn: ["cancelled", "declined", "expired"] } },
    orderBy: [{ eventDate: { sort: "asc", nulls: "last" } }],
    select: {
      id: true, trackingCode: true, eventType: true, eventDate: true, status: true, totalCents: true, paidCents: true, depositCents: true, currency: true,
      dos: true, playlistUrl: true, assignments: { where: { status: "accepted" }, take: 1, select: { id: true } },
    },
  });
  const today = new Date().toISOString().slice(0, 10);
  const next = bookings.find((b) => b.eventDate && b.eventDate.toISOString().slice(0, 10) >= today) ?? bookings[0];
  if (!next) return null;
  const accepted = !["inquiry", "quoted"].includes(next.status);
  const hasWishes = Boolean(next.playlistUrl) || (Array.isArray(next.dos) && next.dos.length > 0);
  const checks = [
    { key: "quote", done: accepted },
    { key: "deposit", done: accepted && next.paidCents >= next.depositCents && next.totalCents > 0 },
    { key: "artist", done: next.assignments.length > 0 },
    { key: "wishes", done: hasWishes },
    { key: "paid", done: next.totalCents > 0 && next.paidCents >= next.totalCents },
  ] as const;
  const done = checks.filter((c) => c.done).length;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{t("readiness")}</CardTitle>
          <CardDescription>{t("readinessHint", { done, total: checks.length })}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-success" style={{ width: `${(done / checks.length) * 100}%` }} />
          </div>
          <ul className="grid gap-2 text-sm">
            {checks.map((c) => (
              <li key={c.key} className={cn("flex items-center gap-2", !c.done && "text-muted-foreground")}>
                {c.done ? <CheckCircle2Icon className="size-4 text-success" aria-hidden /> : <CircleIcon className="size-4" aria-hidden />}
                {t(`check_${c.key}`)}
                <span className="sr-only">{c.done ? "✓" : "—"}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("paymentProgress")}</CardTitle>
          <CardDescription>{t("yourBookings")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {bookings
            .filter((b) => b.totalCents > 0)
            .slice(0, 5)
            .map((b) => {
              const pct = Math.min(100, Math.round((b.paidCents / b.totalCents) * 100));
              return (
                <div key={b.id} className="grid gap-1.5 text-sm">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium">
                      {te(b.eventType as EventType)} <span className="font-mono text-xs text-muted-foreground">{b.trackingCode}</span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">{t("paidOf", { paid: euro(format, b.paidCents, b.currency), total: euro(format, b.totalCents, b.currency) })}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${pct}%`}>
                    <div className={cn("h-full rounded-full", pct >= 100 ? "bg-success" : "bg-primary")} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
        </CardContent>
      </Card>
    </div>
  );
}

/** Partner analytics: clicks, sign-ups and commission over the year; campaigns; commission by status. */
export async function AffiliateAnalytics({ affiliateId }: { affiliateId: string }) {
  const [t, ta, format, d] = await Promise.all([getTranslations("dashboards"), getTranslations("affiliate"), getFormatter(), affiliateDashboard(affiliateId)]);
  const clicks = d.clicksByMonth.reduce((s, m) => s + m.value, 0);
  const signups = d.signupsByMonth.reduce((s, m) => s + m.value, 0);
  return (
    <section className="grid gap-6" aria-labelledby="affiliate-analytics">
      <div className="grid gap-1">
        <h2 id="affiliate-analytics" className="text-lg font-semibold">
          {t("analyticsTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("analyticsHint")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard tone="teal" label={t("clickToSignup")} value={clicks ? `${Math.round((signups / clicks) * 100)}%` : "—"} hint={`${signups} / ${clicks}`} icon={PercentIcon} />
        <StatCard tone="violet" label={t("commissionsYear")} value={euro(format, d.commissionsByMonth.reduce((s, m) => s + m.value, 0))} hint={t("commissionsTrendHint")} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("clicksTrend")}</CardTitle>
          </CardHeader>
          <CardContent>
            <AreaTrend label={t("clicksTrend")} unit="count" data={d.clicksByMonth} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("commissionsTrend")}</CardTitle>
            <CardDescription>{t("commissionsTrendHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <AreaTrend label={t("commissionsTrend")} unit="cents" data={d.commissionsByMonth} />
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("campaigns")}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList share empty={t("noData")} items={d.campaigns.sort((a, b) => b.value - a.value).map((c) => ({ key: c.key || "none", label: c.key || t("noCampaign"), value: c.value }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("commissionStatus")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ShareBar
              otherLabel={t("other")}
              empty={t("noData")}
              items={d.commissionStatuses.map((s) => ({ key: s.key, label: ta.has(`commission_${s.key}` as "commission_paid") ? ta(`commission_${s.key}` as "commission_paid") : s.key, value: s.value, display: euro(format, s.value) }))}
            />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
