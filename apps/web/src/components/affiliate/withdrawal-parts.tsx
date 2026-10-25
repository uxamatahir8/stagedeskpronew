import { CheckIcon, CircleDotIcon, XIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import type { withdrawalDetail } from "@stagedesk/db";
import { CommissionStatusBadge, Pill } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { euro, eventDate, percent } from "@/lib/format";
import { cn } from "@/lib/utils";

type Detail = NonNullable<Awaited<ReturnType<typeof withdrawalDetail>>>;

const tones = { requested: "info", approved: "brand", paid: "success", rejected: "danger", failed: "danger", cancelled: "neutral" } as const;

export async function WithdrawalStatus({ status }: { status: string }) {
  const t = await getTranslations("withdrawals");
  return <Pill tone={tones[status as keyof typeof tones] ?? "neutral"}>{t(`status_${status as "paid"}`)}</Pill>;
}

/** Amount, method, destination and references in one card. */
export async function WithdrawalSummary({ payout }: { payout: Detail }) {
  const [t, format] = await Promise.all([getTranslations("withdrawals"), getFormatter()]);
  const details = (payout.details ?? {}) as { iban?: string; accountName?: string; paypalEmail?: string; stripeAccountId?: string };
  const destination = details.iban ? `${details.accountName ?? ""} · ${details.iban.replace(/(.{4})/g, "$1 ").trim()}` : (details.paypalEmail ?? details.stripeAccountId ?? "—");
  const rows: [string, React.ReactNode][] = [
    [t("amount"), <span key="a" className="text-lg font-semibold tabular-nums">{euro(format, payout.amountCents)}</span>],
    [t("status"), <WithdrawalStatus key="s" status={payout.status} />],
    [t("method"), t(`method_${payout.method as "stripe"}`)],
    [t("destination"), <span key="d" className="font-mono text-xs">{destination}</span>],
    [t("requestedOn"), format.dateTime(payout.createdAt, { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })],
    ...(payout.paidAt ? ([[t("paidOn"), format.dateTime(payout.paidAt, { day: "numeric", month: "long", year: "numeric" })]] as [string, React.ReactNode][]) : []),
    ...(payout.transactionRef ? ([[t("transactionRef"), <span key="r" className="font-mono text-xs">{payout.transactionRef}</span>]] as [string, React.ReactNode][]) : []),
    ...(payout.rejectReason ? ([[t("rejectReason"), payout.rejectReason]] as [string, React.ReactNode][]) : []),
    ...(payout.error ? ([[t("error"), <span key="e" className="text-destructive">{payout.error.slice(0, 200)}</span>]] as [string, React.ReactNode][]) : []),
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono">{payout.reference ?? payout.id.slice(0, 8)}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

/** Every step, oldest first, with who did it and why. */
export async function WithdrawalTimeline({ payout, names }: { payout: Detail; names: Record<string, string> }) {
  const [t, format] = await Promise.all([getTranslations("withdrawals"), getFormatter()]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("timeline")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="relative grid gap-5 border-l pl-6">
          {payout.events.map((e) => {
            const Icon = ["rejected", "failed", "cancelled"].includes(e.status) ? XIcon : e.status === "paid" ? CheckIcon : CircleDotIcon;
            return (
              <li key={e.id} className="relative grid gap-0.5 text-sm">
                <span
                  className={cn(
                    "absolute top-0.5 -left-[2.1rem] grid size-6 place-items-center rounded-full border bg-background",
                    e.status === "paid" && "border-success text-success",
                    ["rejected", "failed"].includes(e.status) && "border-destructive text-destructive",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                </span>
                <span className="font-medium">{t(`event_${e.status as "paid"}`)}</span>
                <span className="text-xs text-muted-foreground">
                  {format.dateTime(e.createdAt, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  {e.actorId && ` · ${e.actorId === "system" ? t("system") : (names[e.actorId] ?? t("platform"))}`}
                </span>
                {e.note && <span className="text-muted-foreground">{e.note}</span>}
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

/** The commissions in a withdrawal: which agency paid what, and what that earned. */
export async function WithdrawalCommissions({ payout }: { payout: Detail }) {
  const [t, ta, format] = await Promise.all([getTranslations("withdrawals"), getTranslations("affiliate"), getFormatter()]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("commissionsIn", { count: payout.commissions.length })}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{ta("date")}</TableHead>
              <TableHead>{ta("agency")}</TableHead>
              <TableHead>{t("invoiceRef")}</TableHead>
              <TableHead className="text-right">{ta("invoice")}</TableHead>
              <TableHead className="text-right">{ta("commission")}</TableHead>
              <TableHead>{ta("status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payout.commissions.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="whitespace-nowrap tabular-nums">{eventDate(format, c.createdAt, "short")}</TableCell>
                <TableCell>{c.referral.agency.name}</TableCell>
                <TableCell className="font-mono text-xs">{c.stripeInvoiceId}</TableCell>
                <TableCell className="text-right tabular-nums">{euro(format, c.baseCents)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {euro(format, c.amountCents)}
                  <div className="text-xs font-normal text-muted-foreground">{percent(format, c.commissionBps)}</div>
                </TableCell>
                <TableCell>
                  <CommissionStatusBadge status={c.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
