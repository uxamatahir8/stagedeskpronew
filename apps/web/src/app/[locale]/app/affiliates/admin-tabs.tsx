import { BanknoteIcon, ClockIcon, HourglassIcon, MousePointerClickIcon, TrendingUpIcon, UsersIcon, WalletIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import { todayInNetherlands } from "@stagedesk/core";
import { affiliateReport, listWithdrawals, prisma } from "@stagedesk/db";
import { WithdrawalStatus } from "@/components/affiliate/withdrawal-parts";
import { ColumnChart } from "@/components/charts/column-chart";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { CommissionStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/list/data-table";
import { Link } from "@/i18n/navigation";
import { euro, eventDate, percent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { WithdrawalActions } from "./withdrawal-controls";

/** Program figures: money by stage, the funnel, the best partners and the last twelve months. */
export async function ReportTab({ range }: { range: string }) {
  const [t, tw, format] = await Promise.all([getTranslations("affiliatesAdmin"), getTranslations("withdrawals"), getFormatter()]);
  const days = { "30": 30, "90": 90, "365": 365 }[range] ?? null;
  const report = await affiliateReport(days);
  const ranges = ["30", "90", "365", "all"] as const;
  const conversion = report.funnel.referrals ? Math.round((report.funnel.paying / report.funnel.referrals) * 100) : 0;
  return (
    <div className="grid gap-6">
      <nav className="flex w-fit gap-1 rounded-lg border p-1 text-sm" aria-label={t("range")}>
        {ranges.map((r) => (
          <Link
            key={r}
            href={r === "all" ? "/app/affiliates" : `/app/affiliates?range=${r}`}
            aria-current={(range || "all") === r ? "page" : undefined}
            className={cn("rounded-md px-3 py-1", (range || "all") === r ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}
          >
            {t(`range_${r}`)}
          </Link>
        ))}
      </nav>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} icon={HourglassIcon} label={tw("waiting")} value={euro(format, report.commissions.waiting)} hint={t("waitingHint")} />
        <StatCard index={1} icon={WalletIcon} label={tw("available")} value={euro(format, report.commissions.available)} hint={t("availableHint")} />
        <StatCard index={2} icon={ClockIcon} label={t("openWithdrawals")} value={euro(format, report.withdrawals.open)} hint={t("openCount", { count: report.withdrawals.openCount })} />
        <StatCard index={3} icon={BanknoteIcon} label={tw("paidTotal")} value={euro(format, report.commissions.paid)} hint={report.withdrawals.failed ? t("failedCount", { count: report.withdrawals.failed }) : undefined} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} icon={UsersIcon} label={t("active")} value={report.affiliates["approved"] ?? 0} hint={t("applicationsWaiting", { count: report.affiliates["pending"] ?? 0 })} />
        <StatCard index={1} icon={MousePointerClickIcon} label={t("clicks")} value={format.number(report.funnel.clicks)} />
        <StatCard index={2} icon={UsersIcon} label={t("referredAgencies")} value={report.funnel.referrals} hint={t("payingAgencies", { count: report.funnel.paying })} />
        <StatCard index={3} icon={TrendingUpIcon} label={t("conversion")} value={`${conversion}%`} hint={t("conversionHint")} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{t("monthlyTitle")}</CardTitle>
            <CardDescription>{t("monthlyHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ColumnChart
              label={t("monthlyTitle")}
              unit="cents"
              data={report.monthly.map((m) => ({ month: m.month, values: [m.earned, m.paid] }))}
              series={[
                { key: "earned", label: t("earned"), color: "var(--chart-1)" },
                { key: "paid", label: t("paidOut"), color: "var(--chart-2)" },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("topPartners")}</CardTitle>
          </CardHeader>
          <CardContent>
            {report.top.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noCommissionsYet")}</p>
            ) : (
              <ol className="grid gap-2 text-sm">
                {report.top.map((a, i) => (
                  <li key={a.affiliateId} className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <span className="w-5 text-right text-muted-foreground tabular-nums">{i + 1}</span>
                      <Link href={`/app/affiliates?tab=commissions&affiliate=${a.affiliateId}`} className="font-medium hover:underline">
                        {a.name}
                      </Link>
                    </span>
                    <span className="tabular-nums">
                      {euro(format, a.cents)} <span className="text-muted-foreground">· {a.count}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Requests to act on first, then everything else, newest first. */
const withdrawalSpec = { sorts: ["queue", "date", "partner", "amount"], defaultSort: "queue", defaultDir: "asc" as const, filters: { method: ["stripe", "bank_transfer", "paypal"] } };
const commissionSpec = { sorts: ["date", "partner", "agency", "invoice", "commission"], defaultSort: "date", defaultDir: "desc" as const };

export async function WithdrawalsTab({ status }: { status: string | null }) {
  const [t, format] = await Promise.all([getTranslations("withdrawals"), getFormatter()]);
  const statuses = ["requested", "approved", "paid", "failed", "rejected", "cancelled"] as const;
  const rows = await listWithdrawals({ status, take: 2000 });
  const today = todayInNetherlands();
  return (
    <div className="grid gap-4">
      <nav className="flex flex-wrap gap-1 text-sm" aria-label={t("status")}>
        {[null, ...statuses].map((s) => (
          <Link
            key={s ?? "all"}
            href={s ? `/app/affiliates?tab=withdrawals&status=${s}` : "/app/affiliates?tab=withdrawals"}
            aria-current={status === s ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1", status === s ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground")}
          >
            {s ? t(`status_${s}`) : t("filterAll")}
          </Link>
        ))}
        <a href="/api/export/withdrawals" className="ml-auto rounded-full border px-3 py-1 text-muted-foreground hover:text-foreground" download>
          {t("exportCsv")}
        </a>
      </nav>
      {rows.length === 0 ? (
        <EmptyState icon={WalletIcon} title={t("noWithdrawals")} />
      ) : (
        <DataTable
          spec={withdrawalSpec}
          placeholder={t("searchPartner")}
          filters={[{ key: "method", label: t("method"), options: [...new Set(rows.map((p) => p.method))].map((m) => ({ value: m, label: t(`method_${m as "stripe"}`) })) }]}
          columns={[
            { label: t("reference") },
            { label: t("partner"), sort: "partner" },
            { label: t("method") },
            { label: t("requestedOn"), sort: "date" },
            { label: t("status") },
            { label: t("amount"), sort: "amount", align: "right" },
            { label: t("actions"), align: "right" },
          ]}
          rows={rows.map((p) => ({
            id: p.id,
            text: `${p.reference ?? p.id} ${p.affiliate.user.name} ${p.affiliate.user.email}`,
            // Requests waiting for a decision first, newest first within each group.
            values: { queue: `${p.status === "requested" ? 0 : 1}-${String(9e12 - p.createdAt.getTime()).padStart(14, "0")}`, partner: p.affiliate.user.name, date: p.createdAt.getTime(), amount: p.amountCents },
            facets: { method: p.method },
            cells: [
              <div key="r">
                <Link href={`/app/affiliates/withdrawals/${p.id}`} className="font-mono text-sm font-medium underline-offset-4 hover:underline">
                  {p.reference ?? p.id.slice(0, 8)}
                </Link>
                <div className="text-xs text-muted-foreground">{t("commissionCount", { count: p._count.commissions })}</div>
              </div>,
              <div key="p">
                {p.affiliate.user.name}
                <div className="text-xs text-muted-foreground">{p.affiliate.user.email}</div>
              </div>,
              t(`method_${p.method as "stripe"}`),
              eventDate(format, p.createdAt, "short"),
              <WithdrawalStatus key="s" status={p.status} />,
              <span key="a" className="font-medium">{euro(format, p.amountCents)}</span>,
              <WithdrawalActions key="x" payoutId={p.id} status={p.status} method={p.method} today={today} />,
            ],
          }))}
        />
      )}
    </div>
  );
}

/** Every commission, traceable from the agency's invoice to the withdrawal that paid it. */
export async function CommissionsTab({ status, affiliateId }: { status: string | null; affiliateId: string | null }) {
  const [t, ta, tw, format] = await Promise.all([getTranslations("affiliatesAdmin"), getTranslations("affiliate"), getTranslations("withdrawals"), getFormatter()]);
  const statuses = ["pending", "review", "approved", "requested", "paid", "cancelled"] as const;
  const rows = await prisma.commission.findMany({
    where: { ...(status ? { status } : {}), ...(affiliateId ? { affiliateId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 5000,
    include: {
      affiliate: { include: { user: { select: { name: true } } } },
      referral: { select: { agency: { select: { name: true } } } },
      payout: { select: { id: true, reference: true } },
    },
  });
  const qs = (s: string | null) => `/app/affiliates?tab=commissions${s ? `&status=${s}` : ""}${affiliateId ? `&affiliate=${affiliateId}` : ""}`;
  return (
    <div className="grid gap-4">
      <nav className="flex flex-wrap gap-1 text-sm" aria-label={ta("status")}>
        {[null, ...statuses].map((s) => (
          <Link
            key={s ?? "all"}
            href={qs(s)}
            aria-current={status === s ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1", status === s ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground")}
          >
            {s ? ta(`commission_${s}`) : tw("filterAll")}
          </Link>
        ))}
        {affiliateId && (
          <Link href={`/app/affiliates?tab=commissions${status ? `&status=${status}` : ""}`} className="rounded-full border border-dashed px-3 py-1 text-muted-foreground">
            {t("allPartners")} ×
          </Link>
        )}
        <a href="/api/export/commissions" className="ml-auto rounded-full border px-3 py-1 text-muted-foreground hover:text-foreground" download>
          {tw("exportCsv")}
        </a>
      </nav>
      {rows.length === 0 ? (
        <EmptyState icon={WalletIcon} title={t("noCommissionsYet")} />
      ) : (
        <DataTable
          spec={commissionSpec}
          placeholder={t("searchCommissions")}
          columns={[
            { label: ta("date"), sort: "date" },
            { label: tw("partner"), sort: "partner" },
            { label: ta("agency"), sort: "agency" },
            { label: tw("invoiceRef") },
            { label: ta("invoice"), sort: "invoice", align: "right" },
            { label: ta("commission"), sort: "commission", align: "right" },
            { label: ta("status") },
            { label: tw("withdrawal") },
          ]}
          rows={rows.map((c) => ({
            id: c.id,
            text: `${c.affiliate.user.name} ${c.referral.agency.name} ${c.stripeInvoiceId ?? ""} ${c.payout?.reference ?? ""}`,
            values: { date: c.createdAt.getTime(), partner: c.affiliate.user.name, agency: c.referral.agency.name, invoice: c.baseCents, commission: c.amountCents },
            cells: [
              eventDate(format, c.createdAt, "short"),
              c.affiliate.user.name,
              c.referral.agency.name,
              <span key="i" className="font-mono text-xs">{c.stripeInvoiceId}</span>,
              euro(format, c.baseCents),
              <div key="c" className="font-medium">
                {euro(format, c.amountCents)}
                <div className="text-xs font-normal text-muted-foreground">{percent(format, c.commissionBps)}</div>
              </div>,
              <div key="s">
                <CommissionStatusBadge status={c.status} />
                {["pending", "review"].includes(c.status) && <div className="mt-1 text-xs text-muted-foreground">{ta("availableOn", { date: eventDate(format, c.availableAt, "short") ?? "" })}</div>}
                {c.cancelReason && <div className="mt-1 text-xs text-muted-foreground">{c.cancelReason}</div>}
              </div>,
              c.payout ? (
                <Link key="p" href={`/app/affiliates/withdrawals/${c.payout.id}`} className="font-mono text-xs underline-offset-4 hover:underline">
                  {c.payout.reference ?? c.payout.id.slice(0, 8)}
                </Link>
              ) : (
                "—"
              ),
            ],
          }))}
        />
      )}
    </div>
  );
}
