import { BanknoteIcon, ClockIcon, CreditCardIcon, TriangleAlertIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import { todayInNetherlands } from "@stagedesk/core";
import { customerPaymentClaims } from "@stagedesk/db";
import { amountDue } from "@stagedesk/payments";
import { FormMessage } from "@/components/auth/auth-card";
import { CopyField } from "@/components/copy-field";
import { RedirectButton, type RedirectResult } from "@/components/redirect-button";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/actions";
import { euro } from "@/lib/format";
import type { ReportPaymentInput } from "@/lib/pay-actions";
import { paymentOptions } from "@/lib/payment-claims";
import { ReportPaymentDialog } from "./report-payment";
import { RequestPaymentDetailsButton } from "./request-payment-details";

/**
 * What the customer still owes and every way they may pay it: online through
 * Stripe, or by bank transfer / cash, which they report and the agency then
 * confirms. `paid` is the ?paid= flag Stripe returns with.
 */
export async function PayPanel({
  booking,
  pay,
  report,
  paid,
  allowRequestDetails,
}: {
  booking: { id: string; trackingCode: string; organizationId: string; customerId: string | null; status: string; currency: string; totalCents: number; depositCents: number; paidCents: number };
  pay: () => Promise<RedirectResult>;
  report?: (input: ReportPaymentInput) => Promise<ActionResult>;
  paid?: string | string[];
  allowRequestDetails?: boolean;
}) {
  const [t, format] = await Promise.all([getTranslations("pay"), getFormatter()]);
  const due = ["booked", "confirmed", "completed"].includes(booking.status) ? amountDue(booking) : null;
  if (!due) {
    return (
      <>
        {paid === "1" && <FormMessage tone="success">{t("thanks")}</FormMessage>}
      </>
    );
  }
  const [options, claims] = await Promise.all([
    paymentOptions(booking.organizationId),
    booking.customerId ? customerPaymentClaims(booking.id, booking.customerId) : Promise.resolve([]),
  ]);
  const pending = claims.find((c) => c.status === "pending");
  const lastRejected = !pending && claims[0]?.status === "rejected" ? claims[0] : null;
  const methods = [...(options.bank ? (["bank_transfer"] as const) : []), ...(options.cash ? (["cash"] as const) : [])];
  const amount = euro(format, due.amountCents, booking.currency);
  const date = (d: Date) => format.dateTime(d, { day: "numeric", month: "long", timeZone: "UTC" });

  return (
    <div className="grid gap-4">
      {paid === "1" && <FormMessage tone="success">{t("thanks")}</FormMessage>}
      {paid === "0" && <FormMessage>{t("cancelled")}</FormMessage>}
      {pending && (
        <p role="status" className="flex items-start gap-2 rounded-lg bg-info/10 px-3 py-2 text-sm">
          <ClockIcon className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
          {t("claimPending", { amount: euro(format, pending.amountCents, booking.currency), date: date(pending.paidOn) })}
        </p>
      )}
      {lastRejected && (
        <p role="status" className="flex items-start gap-2 rounded-lg bg-warning/18 px-3 py-2 text-sm">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("claimRejected", { amount: euro(format, lastRejected.amountCents, booking.currency), reason: lastRejected.rejectReason ?? "—" })}
        </p>
      )}

      {options.online && (
        <div className="flex flex-wrap items-center gap-3">
          <RedirectButton action={pay}>
            <CreditCardIcon />
            {t(due.kind === "deposit" ? "payDeposit" : "payBalance", { amount })}
          </RedirectButton>
          <span className="text-sm text-muted-foreground">{t("methods")}</span>
        </div>
      )}

      {options.bank && !pending && (
        <div className="grid gap-3 rounded-xl border bg-muted/30 p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <BanknoteIcon className="size-4 text-primary" aria-hidden />
            {options.online ? t("orTransfer", { amount }) : t("transfer", { amount })}
          </p>
          <div className="grid min-w-0 gap-3">
            <CopyField label={t("iban")} value={options.bank.iban} wrap />
            <CopyField label={t("accountName")} value={options.bank.name} wrap />
            <CopyField label={t("amount")} value={amount} wrap />
            <CopyField label={t("reference")} value={booking.trackingCode} wrap />
          </div>
          {options.bank.instructions && <p className="text-sm whitespace-pre-line text-muted-foreground">{options.bank.instructions}</p>}
        </div>
      )}

      {methods.length > 0 && report && !pending && <ReportPaymentDialog report={report} methods={methods} defaultAmount={(due.amountCents / 100).toFixed(2).replace(".", ",")} today={todayInNetherlands()} reference={booking.trackingCode} />}
      {!options.online && methods.length === 0 && (
        <div className="grid gap-3">
          <Button disabled className="w-fit">
            <CreditCardIcon />
            {t(due.kind === "deposit" ? "payDeposit" : "payBalance", { amount })}
          </Button>
          <p className="text-sm text-muted-foreground">{t("unavailable")}</p>
          {allowRequestDetails && (
            <RequestPaymentDetailsButton
              code={booking.trackingCode}
              body={t("requestMessage", { reference: booking.trackingCode, amount })}
              label={t("requestDetails")}
              sentLabel={t("requestSent")}
            />
          )}
        </div>
      )}
    </div>
  );
}
