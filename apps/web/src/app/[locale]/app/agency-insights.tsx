import { ArrowRightIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import { type Permission, todayInNetherlands } from "@stagedesk/core";
import { agencyBilling, agencyRevenueByMonth, agencyUsage, type TenantDb } from "@stagedesk/db";
import { ColumnChart } from "@/components/charts/column-chart";
import { monthDays } from "@/components/month-grid";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * The second half of the agency home: revenue booked vs collected, this
 * month's events, artist workload and plan usage.
 */
export async function AgencyInsights({ organizationId, db, permissions, currency }: { organizationId: string; db: TenantDb; permissions: readonly Permission[]; currency: string }) {
  const showMoney = permissions.includes("agency.reports") && permissions.includes("agency.payments");
  const showPlan = permissions.includes("agency.billing");
  const today = todayInNetherlands();
  const month = today.slice(0, 7);
  const days = monthDays(month);
  const windowStart = new Date(`${month}-01T00:00:00Z`);
  const windowEnd = new Date(windowStart);
  windowEnd.setUTCMonth(windowEnd.getUTCMonth() + 3);

  const [t, format, revenue, events, artists, gigs, billing, usage] = await Promise.all([
    getTranslations("insights"),
    getFormatter(),
    showMoney ? agencyRevenueByMonth(organizationId) : null,
    db.booking.findMany({
      where: { status: { in: ["booked", "confirmed", "completed", "settled"] }, eventDate: { gte: new Date(`${days[0]}T00:00:00Z`), lte: new Date(`${days[41]}T00:00:00Z`) } },
      select: { eventDate: true, status: true },
    }),
    db.artist.findMany({ where: { active: true }, select: { id: true, stageName: true }, orderBy: { stageName: "asc" } }),
    db.bookingAssignment.groupBy({
      by: ["artistId"],
      where: { status: "accepted", booking: { eventDate: { gte: windowStart, lt: windowEnd }, status: { not: "cancelled" } } },
      _count: { _all: true },
    }),
    showPlan ? agencyBilling(organizationId) : null,
    showPlan ? agencyUsage(organizationId) : null,
  ]);

  const perDay = new Map<string, number>();
  for (const e of events) {
    const key = e.eventDate!.toISOString().slice(0, 10);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  const load = artists.map((a) => ({ ...a, gigs: gigs.find((g) => g.artistId === a.id)?._count._all ?? 0 })).sort((a, b) => b.gigs - a.gigs);
  const maxLoad = Math.max(1, ...load.map((a) => a.gigs));
  const weekdays = Array.from({ length: 7 }, (_, i) => format.dateTime(new Date(Date.UTC(2024, 0, 1 + i)), { weekday: "narrow" }));

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {revenue && (
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("revenue")}</CardTitle>
            <CardDescription>{t("revenueHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ColumnChart
              label={t("revenue")}
              unit="cents"
              currency={currency}
              data={revenue}
              series={[
                { key: "booked", label: t("booked"), color: "var(--chart-1)" },
                { key: "collected", label: t("collected"), color: "var(--chart-2)" },
              ]}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{format.dateTime(new Date(`${month}-15T12:00:00Z`), { month: "long", year: "numeric" })}</CardTitle>
          <CardDescription>{t("eventsThisMonth", { count: [...perDay.entries()].filter(([d]) => d.startsWith(month)).reduce((s, [, n]) => s + n, 0) })}</CardDescription>
          <CardAction>
            <Button asChild variant="ghost" size="icon-sm" aria-label={t("openCalendar")}>
              <Link href="/app/calendar">
                <ArrowRightIcon />
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {weekdays.map((d, i) => (
              <span key={i} className="pb-1 font-medium text-muted-foreground">
                {d}
              </span>
            ))}
            {days.map((date) => {
              const count = perDay.get(date) ?? 0;
              const inMonth = date.startsWith(month);
              return (
                <span
                  key={date}
                  title={count ? t("eventsOnDay", { count }) : undefined}
                  className={cn(
                    "flex aspect-square flex-col items-center justify-center rounded-md tabular-nums",
                    !inMonth && "text-muted-foreground/50",
                    count > 0 && inMonth && "bg-primary/12 font-semibold text-foreground",
                    date === today && "ring-2 ring-primary",
                  )}
                >
                  {Number(date.slice(8))}
                  {count > 0 && <span className="mt-0.5 size-1 rounded-full bg-primary" aria-hidden />}
                </span>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className={cn(!showPlan && "lg:col-span-2", !revenue && "lg:col-span-2")}>
        <CardHeader>
          <CardTitle>{t("artistLoad")}</CardTitle>
          <CardDescription>{t("artistLoadHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          {load.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noArtists")}</p>
          ) : (
            <ul className="grid gap-2.5">
              {load.slice(0, 8).map((a) => (
                <li key={a.id} className="grid grid-cols-[minmax(0,9rem)_1fr_2rem] items-center gap-3 text-sm">
                  <span className="truncate">{a.stageName}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-primary/10">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${(a.gigs / maxLoad) * 100}%` }} />
                  </span>
                  <span className="text-right tabular-nums">{a.gigs}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {billing && usage && (
        <Card>
          <CardHeader>
            <CardTitle>{t("plan")}</CardTitle>
            <CardAction>
              <Button asChild variant="ghost" size="icon-sm" aria-label={t("openBilling")}>
                <Link href="/app/billing">
                  <ArrowRightIcon />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {(["maxArtists", "maxStaff", "maxBookingsPerMonth"] as const).map((key) => {
              const max = billing.limits[key];
              const used = usage[key];
              const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
              return (
                <div key={key} className="grid gap-1">
                  <div className="flex justify-between gap-2">
                    <span>{t(`limit_${key}`)}</span>
                    <span className="text-muted-foreground tabular-nums">{max === null ? `${used} · ∞` : `${used} / ${max}`}</span>
                  </div>
                  {max !== null && (
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className={cn("h-full rounded-full", pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-warning" : "bg-primary")} style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
