import { ArrowRightIcon, BadgeCheckIcon, HourglassIcon, Loader2Icon, WalletIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { formatIban } from "@stagedesk/core";
import { affiliateBalance, getSetting, payoutMethods, prisma } from "@stagedesk/db";
import { isStripeConfigured } from "@stagedesk/payments";
import { WithdrawalStatus } from "@/components/affiliate/withdrawal-parts";
import { ConnectCard } from "@/components/connect-card";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { CommissionStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireAffiliate } from "@/lib/affiliate";
import { euro, eventDate, percent } from "@/lib/format";
import { affiliateDashboardAction, connectAffiliateAction } from "./actions";
import { CancelWithdrawalButton, PayoutDetailsForm, WithdrawButton } from "./payout-controls";

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

/**
 * The affiliate's money: what's withdrawable, what's still in its waiting
 * period, where it goes, every withdrawal and every commission.
 */
async function Payouts() {
  const { affiliate } = await requireAffiliate("affiliate.payouts");
  const [t, tw, tn, format, program, balance, commissions, payouts, stripeReady] = await Promise.all([
    getTranslations("affiliate"),
    getTranslations("withdrawals"),
    getTranslations("nav"),
    getFormatter(),
    getSetting("affiliates.program"),
    affiliateBalance(affiliate.id),
    prisma.commission.findMany({
      where: { affiliateId: affiliate.id },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { referral: { select: { agency: { select: { name: true } } } }, payout: { select: { id: true, reference: true } } },
    }),
    prisma.affiliatePayout.findMany({ where: { affiliateId: affiliate.id }, orderBy: { createdAt: "desc" }, take: 50 }),
    isStripeConfigured(),
  ]);
  const paidTotal = commissions.filter((c) => c.status === "paid").reduce((s, c) => s + c.amountCents, 0);
  const methods = payoutMethods.filter((m) => program.payoutMethods[m] && (m !== "stripe" || stripeReady));
  const method = (affiliate.payoutMethod ?? (affiliate.payoutsEnabled ? "stripe" : null)) as (typeof payoutMethods)[number] | null;
  const hasDetails =
    method === "stripe" ? affiliate.payoutsEnabled : method === "bank_transfer" ? Boolean(affiliate.payoutIban) : method === "paypal" ? Boolean(affiliate.paypalEmail) : false;
  const disabledReason =
    affiliate.status !== "approved"
      ? tw("error_not_approved")
      : balance.openRequest
        ? tw("error_open_request")
        : balance.availableCents <= 0
          ? tw("error_nothing_available")
          : balance.availableCents < program.minPayoutCents
            ? tw("belowMinimum", { amount: euro(format, program.minPayoutCents) })
            : !hasDetails
              ? tw("error_details_missing")
              : null;

  return (
    <div className="grid gap-6">
      <PageHeader title={tn("payouts")} description={tw("pageDescription", { days: program.approvalDays, amount: euro(format, program.minPayoutCents) })} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} label={tw("available")} value={euro(format, balance.availableCents)} hint={tw("availableHint", { count: balance.availableCount })} icon={BadgeCheckIcon} />
        <StatCard
          index={1}
          label={tw("waiting")}
          value={euro(format, balance.waitingCents)}
          hint={balance.nextAvailableAt ? tw("nextOn", { date: eventDate(format, balance.nextAvailableAt, "short") ?? "" }) : tw("waitingHint", { days: program.approvalDays })}
          icon={HourglassIcon}
        />
        <StatCard index={2} label={tw("inWithdrawal")} value={euro(format, balance.requestedCents)} icon={Loader2Icon} />
        <StatCard index={3} label={tw("paidTotal")} value={euro(format, paidTotal)} icon={WalletIcon} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{tw("withdrawTitle")}</CardTitle>
          <CardDescription>{tw("withdrawBody")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {balance.openRequest ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 p-4 text-sm">
              <span className="flex items-center gap-2">
                <span className="font-mono">{balance.openRequest.reference}</span>
                <WithdrawalStatus status={balance.openRequest.status} />
                <span className="font-medium tabular-nums">{euro(format, balance.openRequest.amountCents)}</span>
              </span>
              <span className="flex items-center gap-1">
                {balance.openRequest.status === "requested" && <CancelWithdrawalButton payoutId={balance.openRequest.id} />}
                <Link href={`/app/payouts/${balance.openRequest.id}`} className="flex items-center gap-1 font-medium text-primary hover:underline">
                  {tw("track")}
                  <ArrowRightIcon className="size-4" aria-hidden />
                </Link>
              </span>
            </div>
          ) : (
            <WithdrawButton amount={euro(format, balance.availableCents)} disabledReason={disabledReason} />
          )}
        </CardContent>
      </Card>

      {affiliate.status === "approved" && (
        <Card>
          <CardHeader>
            <CardTitle>{tw("detailsTitle")}</CardTitle>
            <CardDescription>{tw("detailsBody")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            {methods.length === 0 ? (
              <p className="text-sm text-muted-foreground">{tw("noMethods")}</p>
            ) : (
              <PayoutDetailsForm
                methods={methods}
                stripeReady={affiliate.payoutsEnabled}
                initial={{
                  method,
                  iban: affiliate.payoutIban ? formatIban(affiliate.payoutIban) : "",
                  accountName: affiliate.payoutAccountName ?? "",
                  paypalEmail: affiliate.paypalEmail ?? "",
                }}
              />
            )}
            {methods.includes("stripe") && (
              <ConnectCard
                stripeReady={stripeReady}
                account={affiliate.stripeAccountId ? { detailsSubmitted: true, payoutsEnabled: affiliate.payoutsEnabled } : null}
                body={t("connectBody")}
                connectedText={t("connected")}
                connect={connectAffiliateAction}
                dashboard={affiliateDashboardAction}
              />
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{tw("history")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {payouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noPayouts")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tw("reference")}</TableHead>
                  <TableHead>{tw("requestedOn")}</TableHead>
                  <TableHead>{tw("method")}</TableHead>
                  <TableHead>{tw("status")}</TableHead>
                  <TableHead className="text-right">{tw("amount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/app/payouts/${p.id}`} className="font-mono text-sm font-medium underline-offset-4 hover:underline">
                        {p.reference ?? p.id.slice(0, 8)}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{eventDate(format, p.createdAt, "short")}</TableCell>
                    <TableCell>{tw(`method_${p.method as "stripe"}`)}</TableCell>
                    <TableCell>
                      <WithdrawalStatus status={p.status} />
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{euro(format, p.amountCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("commissions")}</CardTitle>
          <CardDescription>{tw("commissionsHint", { days: program.approvalDays })}</CardDescription>
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
                  <TableHead>{tw("withdrawal")}</TableHead>
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
                      {["pending", "review"].includes(c.status) && (
                        <div className="mt-1 text-xs text-muted-foreground">{t("availableOn", { date: eventDate(format, c.availableAt, "short") ?? "" })}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.payout ? (
                        <Link href={`/app/payouts/${c.payout.id}`} className="font-mono text-xs underline-offset-4 hover:underline">
                          {c.payout.reference ?? c.payout.id.slice(0, 8)}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
