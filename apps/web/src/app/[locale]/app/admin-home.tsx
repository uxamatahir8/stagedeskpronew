import { AlertTriangleIcon, BadgeEuroIcon, BuildingIcon, HandshakeIcon, LifeBuoyIcon, RepeatIcon, TimerIcon, WebhookIcon } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { inquiriesByMonth, newAgenciesByMonth, platformVolumeByMonth, prisma } from "@stagedesk/db";
import { ColumnChart } from "@/components/charts/column-chart";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { daysAgo, euro, startOfMonth } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Platform admin home: revenue, growth, money moving, and what needs a person. */
export async function AdminHome() {
  const since = startOfMonth();
  const thirtyDaysAgo = daysAgo(30);
  // Platform-wide view: deliberately not tenant-scoped.
  const [t, ts, format, paying, statusCounts, fees, churned, agencies, volume, inquiries, failedEvents, openTickets, applications, review, due] = await Promise.all([
    getTranslations("adminHome"),
    getTranslations("home.stats"),
    getFormatter(),
    prisma.subscription.findMany({
      where: { status: { in: ["active", "past_due"] }, stripeSubscriptionId: { not: null } },
      select: { interval: true, plan: { select: { monthlyPriceCents: true, yearlyPriceCents: true } } },
    }),
    prisma.subscription.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.ledgerEntry.aggregate({ where: { type: { in: ["platform_fee", "refund_cost"] }, createdAt: { gte: since } }, _sum: { amountCents: true } }),
    prisma.subscription.count({ where: { status: "canceled", updatedAt: { gte: thirtyDaysAgo } } }),
    newAgenciesByMonth(12),
    platformVolumeByMonth(6),
    inquiriesByMonth(6),
    prisma.stripeEvent.count({ where: { status: "failed" } }),
    prisma.supportTicket.count({ where: { status: "open" } }),
    prisma.affiliate.count({ where: { status: "pending" } }),
    prisma.commission.count({ where: { status: "review" } }),
    prisma.commission.aggregate({ where: { status: "approved", payoutId: null }, _sum: { amountCents: true } }),
  ]);
  const mrr = paying.reduce((sum, s) => sum + (s.interval === "year" ? Math.round(s.plan.yearlyPriceCents / 12) : s.plan.monthlyPriceCents), 0);
  const count = (status: string) => statusCounts.find((s) => s.status === status)?._count._all ?? 0;

  const attention = [
    { key: "failedEvents", n: failedEvents, href: "/app/platform-payments", icon: WebhookIcon, tone: "danger" },
    { key: "openTickets", n: openTickets, href: "/app/support?status=open", icon: LifeBuoyIcon, tone: "warning" },
    { key: "applications", n: applications, href: "/app/affiliates", icon: HandshakeIcon, tone: "info" },
    { key: "review", n: review, href: "/app/affiliates", icon: TimerIcon, tone: "warning" },
    { key: "pastDue", n: count("past_due"), href: "/app/agencies", icon: AlertTriangleIcon, tone: "warning" },
  ].filter((a) => a.n > 0);
  const toneClass = { info: "bg-info/12 text-info", warning: "bg-warning/18 text-foreground", danger: "bg-destructive/12 text-destructive" } as const;

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} label={ts("mrr")} value={euro(format, mrr)} hint={t("churned", { count: churned })} icon={RepeatIcon} />
        <StatCard index={1} label={ts("activeAgencies")} value={count("active") + count("past_due")} hint={t("pastDue", { count: count("past_due") })} icon={BuildingIcon} />
        <StatCard index={2} label={ts("trialing")} value={count("trialing")} icon={TimerIcon} />
        <StatCard index={3} label={ts("platformFees")} value={euro(format, fees._sum.amountCents ?? 0)} hint={t("commissionsDue", { amount: euro(format, due._sum.amountCents ?? 0) })} icon={BadgeEuroIcon} />
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{t("volume")}</CardTitle>
            <CardDescription>{t("volumeHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ColumnChart
              label={t("volume")}
              unit="cents"
              data={volume}
              series={[
                { key: "volume", label: t("paidOnline"), color: "var(--chart-1)" },
                { key: "fees", label: t("fees"), color: "var(--chart-2)" },
              ]}
            />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("attention")}</CardTitle>
          </CardHeader>
          <CardContent>
            {attention.length === 0 ? (
              <EmptyState icon={AlertTriangleIcon} title={t("allClear")} />
            ) : (
              <ul className="divide-y">
                {attention.map((a) => (
                  <li key={a.key}>
                    <Link href={a.href} className="flex items-center gap-3 py-3 hover:bg-accent/40">
                      <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", toneClass[a.tone as keyof typeof toneClass])}>
                        <a.icon className="size-4" />
                      </span>
                      <span className="font-medium">{t(`attention_${a.key as "review"}`, { count: a.n })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("newAgencies")}</CardTitle>
            <CardDescription>{t("newAgenciesHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ColumnChart label={t("newAgencies")} unit="count" data={agencies} series={[{ key: "agencies", label: t("newAgencies"), color: "var(--chart-1)" }]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("inquiries")}</CardTitle>
            <CardDescription>{t("inquiriesHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ColumnChart label={t("inquiries")} unit="count" data={inquiries} series={[{ key: "inquiries", label: t("inquiries"), color: "var(--chart-1)" }]} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
