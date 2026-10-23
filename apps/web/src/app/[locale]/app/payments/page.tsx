import { ArrowDownLeftIcon, ArrowUpRightIcon, Undo2Icon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@stagedesk/db";
import { isStripeConfigured } from "@stagedesk/payments";
import { ConnectCard } from "@/components/connect-card";
import { ExportButton } from "@/components/export-button";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Pill } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { euro, eventDate, startOfMonth } from "@/lib/format";
import { requireAgency } from "@/lib/viewer";
import { agencyDashboardAction, connectAgencyAction } from "./actions";
import { RefundDialog } from "./refund-dialog";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/payments">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "payments" });
  return { title: t("title") };
}

export default async function PaymentsPage({ params }: PageProps<"/[locale]/app/payments">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
      <Payments />
    </Suspense>
  );
}

const sum = (rows: { amountCents: number }[]) => rows.reduce((total, r) => total + r.amountCents, 0);

async function Payments() {
  const { organization, db } = await requireAgency("agency.payments");
  const since = startOfMonth();
  const [t, tm, format, account, payments, monthLedger] = await Promise.all([
    getTranslations("payments"),
    getTranslations("paymentMethods"),
    getFormatter(),
    db.connectedAccount.findFirst({ where: { artistId: null } }),
    db.payment.findMany({
      where: { kind: { not: "refund" } },
      orderBy: { receivedAt: "desc" },
      take: 100,
      include: { booking: { select: { trackingCode: true, completedAt: true, eventDate: true } } },
    }),
    prisma.ledgerEntry.findMany({
      where: { organizationId: organization.id, createdAt: { gte: since }, type: { in: ["transfer", "transfer_reversal", "refund"] } },
      select: { type: true, party: true, amountCents: true },
    }),
  ]);
  const received = sum(payments.filter((p) => p.receivedAt >= since));
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
        stripeReady={isStripeConfigured()}
        account={account}
        body={t("connectBody")}
        connectedText={t("connected")}
        connect={connectAgencyAction}
        dashboard={agencyDashboardAction}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard index={0} label={t("received")} value={euro(format, received)} icon={ArrowDownLeftIcon} />
        <StatCard index={1} label={t("paidOut")} value={euro(format, paidOut)} icon={ArrowUpRightIcon} />
        <StatCard index={2} label={t("refunded")} value={euro(format, refunded)} icon={Undo2Icon} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("list")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("booking")}</TableHead>
                  <TableHead>{t("date")}</TableHead>
                  <TableHead>{t("method")}</TableHead>
                  <TableHead className="text-right">{t("amount")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => {
                  const s = status(p);
                  const refundable = p.amountCents - p.refundedCents;
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link href={`/app/bookings/${p.booking.trackingCode}`} className="font-mono text-sm underline-offset-4 hover:underline">
                          {p.booking.trackingCode}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{eventDate(format, p.receivedAt, "short")}</TableCell>
                      <TableCell>{tm(p.method as "cash")}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {euro(format, p.amountCents)}
                        {p.refundedCents > 0 && <div className="text-xs font-normal text-muted-foreground">−{euro(format, p.refundedCents)}</div>}
                      </TableCell>
                      <TableCell>
                        <Pill tone={s.tone}>{t(`status_${s.key}`)}</Pill>
                      </TableCell>
                      <TableCell className="text-right">
                        {refundable > 0 && (
                          <RefundDialog paymentId={p.id} refundableCents={refundable} refundableLabel={euro(format, refundable)} online={p.method === "stripe"} />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
