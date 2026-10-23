import { BadgeCheckIcon, HourglassIcon, WalletIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { getSetting, prisma } from "@stagedesk/db";
import { isStripeConfigured } from "@stagedesk/payments";
import { ConnectCard } from "@/components/connect-card";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { CommissionStatusBadge, Pill } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Locale } from "@/i18n/routing";
import { requireAffiliate } from "@/lib/affiliate";
import { euro, eventDate, percent } from "@/lib/format";
import { affiliateDashboardAction, connectAffiliateAction } from "./actions";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/payouts">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "nav" });
  return { title: t("payouts") };
}

export default async function PayoutsPage({ params }: PageProps<"/[locale]/app/payouts">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Payouts />
    </Suspense>
  );
}

async function Payouts() {
  const { affiliate } = await requireAffiliate("affiliate.payouts");
  const [t, tn, format, program, commissions, payouts] = await Promise.all([
    getTranslations("affiliate"),
    getTranslations("nav"),
    getFormatter(),
    getSetting("affiliates.program"),
    prisma.commission.findMany({
      where: { affiliateId: affiliate.id },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { referral: { select: { agency: { select: { name: true } } } } },
    }),
    prisma.affiliatePayout.findMany({ where: { affiliateId: affiliate.id }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const total = (statuses: string[]) => commissions.filter((c) => statuses.includes(c.status)).reduce((s, c) => s + c.amountCents, 0);

  return (
    <div className="grid gap-6">
      <PageHeader title={tn("payouts")} description={t("payoutsDescription", { amount: euro(format, program.minPayoutCents), day: program.payoutDayOfMonth })} />
      {affiliate.status === "approved" && (
        <ConnectCard
          stripeReady={await isStripeConfigured()}
          account={affiliate.stripeAccountId ? { detailsSubmitted: true, payoutsEnabled: affiliate.payoutsEnabled } : null}
          body={t("connectBody")}
          connectedText={t("connected")}
          connect={connectAffiliateAction}
          dashboard={affiliateDashboardAction}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard index={0} label={t("pending")} value={euro(format, total(["pending", "review"]))} hint={t("pendingHint", { days: program.approvalDays })} icon={HourglassIcon} />
        <StatCard index={1} label={t("approved")} value={euro(format, total(["approved"]))} icon={BadgeCheckIcon} />
        <StatCard index={2} label={t("paid")} value={euro(format, total(["paid"]))} icon={WalletIcon} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("commissions")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {commissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noCommissions")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("date")}</TableHead>
                  <TableHead>{t("agency")}</TableHead>
                  <TableHead className="text-right">{t("invoice")}</TableHead>
                  <TableHead className="text-right">{t("commission")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commissions.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">{eventDate(format, c.createdAt, "short")}</TableCell>
                    <TableCell>{c.referral.agency.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{euro(format, c.baseCents)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {euro(format, c.amountCents)}
                      <div className="text-xs font-normal text-muted-foreground">{percent(format, c.commissionBps)}</div>
                    </TableCell>
                    <TableCell>
                      <CommissionStatusBadge status={c.status} />
                      {c.status === "pending" && <div className="mt-1 text-xs text-muted-foreground">{t("availableOn", { date: eventDate(format, c.availableAt, "short") ?? "" })}</div>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("payoutHistory")}</CardTitle>
        </CardHeader>
        <CardContent>
          {payouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noPayouts")}</p>
          ) : (
            <ul className="divide-y text-sm">
              {payouts.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="tabular-nums">{eventDate(format, p.createdAt)}</span>
                  <span className="flex items-center gap-3">
                    <Pill tone={p.status === "paid" ? "success" : "danger"}>{t(`payout_${p.status as "paid"}`)}</Pill>
                    <span className="font-medium tabular-nums">{euro(format, p.amountCents)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
