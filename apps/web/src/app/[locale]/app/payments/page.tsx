import { ArrowDownLeftIcon, ArrowUpRightIcon, Undo2Icon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { pageWindow, parseListQuery } from "@stagedesk/core";
import { getSetting, pendingPaymentClaims, type Prisma, prisma } from "@stagedesk/db";
import { isStripeConfigured } from "@stagedesk/payments";
import { ClaimReview } from "@/components/booking/claim-review";
import { ConnectCard } from "@/components/connect-card";
import { refreshIncompleteAccount } from "@/lib/connect";
import { ExportButton } from "@/components/export-button";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Pill } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { ServerTable } from "@/components/list/data-table";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { daysAgo, euro, eventDate, startOfMonth } from "@/lib/format";
import { requireAgency } from "@/lib/viewer";
import { agencyDashboardAction, connectAgencyAction } from "./actions";
import { RefundDialog } from "./refund-dialog";
import { IfCan } from "@/components/if-can";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/payments">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "payments" });
  return { title: t("title") };
}

export default async function PaymentsPage({ params, searchParams }: PageProps<"/[locale]/app/payments">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
      <Payments searchParams={searchParams} />
    </Suspense>
  );
}

const sum = (rows: { amountCents: number }[]) => rows.reduce((total, r) => total + r.amountCents, 0);

const methodKeys = ["stripe", "bank_transfer", "cash", "card", "other"];
const statusKeys = ["waiting", "paidOut", "paid", "partly", "refunded"];
const spec = { sorts: ["date", "amount", "booking", "method"], defaultSort: "date", defaultDir: "desc" as const, filters: { method: methodKeys, status: statusKeys } };

async function Payments({ searchParams }: Pick<PageProps<"/[locale]/app/payments">, "searchParams">) {
  const { organization, db } = await requireAgency("agency.payments");
  const since = startOfMonth();
  const query = parseListQuery(await searchParams, spec);
  const and: Prisma.PaymentWhereInput[] = [{ kind: { not: "refund" } }];
  if (query.filters.method) and.push({ method: query.filters.method });
  const paymentAmount = db.payment.fields.amountCents;
  if (query.filters.status === "refunded") and.push({ refundedCents: { gte: paymentAmount, gt: 0 } });
  if (query.filters.status === "partly") and.push({ refundedCents: { gt: 0, lt: paymentAmount } });
  if (query.filters.status === "paid") and.push({ method: { not: "stripe" }, refundedCents: 0 });
  if (query.filters.status === "paidOut") and.push({ method: "stripe", refundedCents: 0, transferredAt: { not: null } });
  if (query.filters.status === "waiting") and.push({ method: "stripe", refundedCents: 0, transferredAt: null });
  if (query.q) {
    and.push({ OR: [{ reference: { contains: query.q } }, { booking: { OR: [{ trackingCode: { contains: query.q.toUpperCase() } }, { customer: { name: { contains: query.q } } }] } }] });
  }
  const where: Prisma.PaymentWhereInput = { AND: and };
  const orderBy: Prisma.PaymentOrderByWithRelationInput[] =
    query.sort === "amount" ? [{ amountCents: query.dir }] : query.sort === "booking" ? [{ booking: { trackingCode: query.dir } }] : query.sort === "method" ? [{ method: query.dir }, { receivedAt: "desc" }] : [{ receivedAt: query.dir }];
  const total = await db.payment.count({ where });
  const win = pageWindow(query, total);
  const [t, tm, format, storedAccount, payments, monthLedger, claims, tc, methods] = await Promise.all([
    getTranslations("payments"),
    getTranslations("paymentMethods"),
    getFormatter(),
    db.connectedAccount.findFirst({ where: { artistId: null } }),
    db.payment.findMany({
      where,
      orderBy,
      skip: win.skip,
      take: win.take,
      include: { booking: { select: { trackingCode: true, completedAt: true, eventDate: true, customer: { select: { name: true } } } } },
    }),
    prisma.ledgerEntry.findMany({
      where: { organizationId: organization.id, createdAt: { gte: since }, type: { in: ["transfer", "transfer_reversal", "refund"] } },
      select: { type: true, party: true, amountCents: true },
    }),
    pendingPaymentClaims(organization.id),
    getTranslations("paymentClaims"),
    getSetting("payments.methods"),
  ]);
  const monthIn = await db.payment.aggregate({ where: { kind: { not: "refund" }, receivedAt: { gte: since } }, _sum: { amountCents: true } });
  const account = (await refreshIncompleteAccount(storedAccount)) ? await db.connectedAccount.findFirst({ where: { artistId: null } }) : storedAccount;
  // A report older than the platform's confirmation window is flagged.
  const overdueBefore = daysAgo(methods.confirmWithinDays);
  const received = monthIn._sum.amountCents ?? 0;
  const paidOut = sum(monthLedger.filter((l) => l.party === "agency"));
  const refunded = sum(monthLedger.filter((l) => l.type === "refund"));

  const status = (p: (typeof payments)[number]) => {
    if (p.refundedCents >= p.amountCents) return { key: "refunded", tone: "danger" } as const;
    if (p.refundedCents > 0) return { key: "partly", tone: "warning" } as const;
    if (p.method !== "stripe") return { key: "paid", tone: "success" } as const;
    return p.transferredAt ? ({ key: "paidOut", tone: "success" } as const) : ({ key: "waiting", tone: "info" } as const);
  };

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} actions={<ExportButton kind="payments" />} />
      <ConnectCard
        stripeReady={await isStripeConfigured()}
        account={account}
        body={t("connectBody")}
        connectedText={t("connected")}
        connect={connectAgencyAction}
        dashboard={agencyDashboardAction}
      />

      {claims.length > 0 && (
        <Card className="border-info/40">
          <CardHeader>
            <CardTitle>{tc("waitingTitle", { count: claims.length })}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {claims.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="grid gap-0.5 text-sm">
                  <span className="font-medium">
                    {euro(format, c.amountCents, organization.currency)} · {tm(c.method as "cash")}
                    {c.createdAt < overdueBefore && <Pill tone="warning" className="ml-2">{tc("overdue")}</Pill>}
                  </span>
                  <span className="text-muted-foreground">
                    {c.booking.customer?.name ?? "—"} ·{" "}
                    <Link href={`/app/bookings/${c.booking.trackingCode}`} className="font-mono underline-offset-4 hover:underline">
                      {c.booking.trackingCode}
                    </Link>{" "}
                    · {tc("reportedDetail", { date: format.dateTime(c.paidOn, { day: "numeric", month: "long", timeZone: "UTC" }), reference: c.reference ?? "—" })}
                  </span>
                </div>
                <IfCan permission="agency.payments.confirm">
                  <ClaimReview claimId={c.id} paidOn={c.paidOn.toISOString().slice(0, 10)} />
                </IfCan>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard index={0} label={t("received")} value={euro(format, received, organization.currency)} icon={ArrowDownLeftIcon} />
        <StatCard index={1} label={t("paidOut")} value={euro(format, paidOut, organization.currency)} icon={ArrowUpRightIcon} />
        <StatCard index={2} label={t("refunded")} value={euro(format, refunded, organization.currency)} icon={Undo2Icon} />
      </div>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">{t("list")}</h2>
        <ServerTable
          spec={spec}
          total={total}
          count={payments.length}
          placeholder={t("searchPlaceholder")}
          filters={[
            { key: "method", label: t("method"), options: methodKeys.map((m) => ({ value: m, label: tm(m as "cash") })) },
            { key: "status", label: t("status"), options: statusKeys.map((k) => ({ value: k, label: t(`status_${k}` as "status_paid") })) },
          ]}
          columns={[
            { label: t("booking"), sort: "booking" },
            { label: t("date"), sort: "date" },
            { label: t("method"), sort: "method" },
            { label: t("amount"), sort: "amount", align: "right" },
            { label: t("status") },
            { label: "" },
          ]}
        >
          {payments.map((p) => {
            const s = status(p);
            const refundable = p.amountCents - p.refundedCents;
            return (
              <TableRow key={p.id}>
                <TableCell>
                  <Link href={`/app/bookings/${p.booking.trackingCode}`} className="font-mono text-sm underline-offset-4 hover:underline">
                    {p.booking.trackingCode}
                  </Link>
                  {p.booking.customer && <div className="text-xs text-muted-foreground">{p.booking.customer.name}</div>}
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{eventDate(format, p.receivedAt, "short")}</TableCell>
                <TableCell>
                  {tm(p.method as "cash")}
                  {p.reference && <div className="max-w-40 truncate text-xs text-muted-foreground">{p.reference}</div>}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {euro(format, p.amountCents, organization.currency)}
                  {p.refundedCents > 0 && <div className="text-xs font-normal text-muted-foreground">−{euro(format, p.refundedCents, organization.currency)}</div>}
                </TableCell>
                <TableCell>
                  <Pill tone={s.tone}>{t(`status_${s.key}`)}</Pill>
                </TableCell>
                <TableCell className="text-right">
                  {refundable > 0 && (
                    <IfCan permission="agency.payments.refund">
                      <RefundDialog paymentId={p.id} refundableCents={refundable} refundableLabel={euro(format, refundable, organization.currency)} online={p.method === "stripe"} />
                    </IfCan>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </ServerTable>
      </section>
    </div>
  );
}
