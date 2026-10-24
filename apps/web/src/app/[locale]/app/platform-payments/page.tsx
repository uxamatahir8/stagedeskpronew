import { BanknoteIcon, PercentIcon, RepeatIcon, Undo2Icon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { pageWindow, parseListQuery } from "@stagedesk/core";
import { type Prisma, prisma } from "@stagedesk/db";
import { isStripeConfigured } from "@stagedesk/payments";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Pill } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { ServerTable } from "@/components/list/data-table";
import type { Locale } from "@/i18n/routing";
import { dateTime, euro, startOfMonth } from "@/lib/format";
import { requirePermission } from "@/lib/viewer";
import { RetryEventButton } from "./retry-button";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/platform-payments">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "platformPayments" });
  return { title: t("title") };
}

export default async function PlatformPaymentsPage({ params, searchParams }: PageProps<"/[locale]/app/platform-payments">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
      <PlatformPayments searchParams={searchParams} />
    </Suspense>
  );
}

const eventTone = { received: "info", processed: "success", failed: "danger", ignored: "neutral" } as const;
const subTone = { trialing: "info", active: "success", past_due: "warning", unpaid: "danger", canceled: "neutral", incomplete: "warning" } as const;

const eventStatuses = ["received", "processed", "failed", "ignored"];
const spec = { sorts: ["received", "type"], defaultSort: "received", defaultDir: "desc" as const, filters: { status: eventStatuses } };

async function PlatformPayments({ searchParams }: Pick<PageProps<"/[locale]/app/platform-payments">, "searchParams">) {
  await requirePermission("platform.payments");
  const query = parseListQuery(await searchParams, spec);
  const eventWhere: Prisma.StripeEventWhereInput = {
    ...(query.filters.status ? { status: query.filters.status } : {}),
    ...(query.q ? { OR: [{ type: { contains: query.q } }, { id: { contains: query.q } }, { error: { contains: query.q } }] } : {}),
  };
  const eventTotal = await prisma.stripeEvent.count({ where: eventWhere });
  const win = pageWindow(query, eventTotal);
  const since = startOfMonth();
  // Platform-wide view: deliberately not tenant-scoped.
  const [t, ts, format, volume, ledger, paying, byStatus, events] = await Promise.all([
    getTranslations("platformPayments"),
    getTranslations("subStatus"),
    getFormatter(),
    prisma.payment.aggregate({ where: { method: "stripe", kind: { not: "refund" }, receivedAt: { gte: since } }, _sum: { amountCents: true } }),
    prisma.ledgerEntry.groupBy({
      by: ["type"],
      where: { createdAt: { gte: since }, type: { in: ["platform_fee", "refund_cost", "refund"] } },
      _sum: { amountCents: true },
    }),
    prisma.subscription.findMany({
      where: { status: { in: ["active", "past_due"] }, stripeSubscriptionId: { not: null } },
      select: { interval: true, plan: { select: { monthlyPriceCents: true, yearlyPriceCents: true } } },
    }),
    prisma.subscription.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.stripeEvent.findMany({
      where: eventWhere,
      orderBy: query.sort === "type" ? [{ type: query.dir }, { receivedAt: "desc" }] : [{ receivedAt: query.dir }],
      skip: win.skip,
      take: win.take,
      select: { id: true, type: true, status: true, error: true, receivedAt: true },
    }),
  ]);
  const ledgerSum = (type: string) => ledger.find((l) => l.type === type)?._sum.amountCents ?? 0;
  const mrr = paying.reduce((sum, s) => sum + (s.interval === "year" ? Math.round(s.plan.yearlyPriceCents / 12) : s.plan.monthlyPriceCents), 0);
  const stripeReady = await isStripeConfigured();

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={<Pill tone={stripeReady ? "success" : "warning"}>{stripeReady ? t("configured") : t("notConfigured")}</Pill>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} label={t("volume")} value={euro(format, volume._sum.amountCents ?? 0)} icon={BanknoteIcon} />
        <StatCard index={1} label={t("fees")} value={euro(format, ledgerSum("platform_fee") + ledgerSum("refund_cost"))} icon={PercentIcon} />
        <StatCard index={2} label={t("refunds")} value={euro(format, ledgerSum("refund"))} icon={Undo2Icon} />
        <StatCard index={3} label={t("mrr")} value={euro(format, mrr)} icon={RepeatIcon} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Card className="content-start">
          <CardHeader>
            <CardTitle>{t("subscriptions")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {byStatus.map((s) => (
                <li key={s.status} className="flex items-center justify-between gap-2">
                  <Pill tone={subTone[s.status as keyof typeof subTone] ?? "neutral"}>{ts(s.status as keyof typeof subTone)}</Pill>
                  <span className="tabular-nums">{s._count._all}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("events")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ServerTable
              spec={spec}
              total={eventTotal}
              count={events.length}
              placeholder={t("searchPlaceholder")}
              filters={[{ key: "status", label: t("eventStatus"), options: eventStatuses.map((k) => ({ value: k, label: t(`status_${k as keyof typeof eventTone}`) })) }]}
              columns={[{ label: t("eventType"), sort: "type" }, { label: t("received"), sort: "received" }, { label: t("eventStatus") }, { label: "" }]}
            >
              {events.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <div className="font-mono text-xs">{e.type}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{e.id}</div>
                    {e.error && <div className="max-w-md truncate text-xs text-destructive" title={e.error}>{e.error}</div>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{dateTime(format, e.receivedAt)}</TableCell>
                  <TableCell>
                    <Pill tone={eventTone[e.status as keyof typeof eventTone] ?? "neutral"}>{t(`status_${e.status as keyof typeof eventTone}`)}</Pill>
                  </TableCell>
                  <TableCell className="text-right">{(e.status === "failed" || e.status === "received") && <RetryEventButton eventId={e.id} />}</TableCell>
                </TableRow>
              ))}
            </ServerTable>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
