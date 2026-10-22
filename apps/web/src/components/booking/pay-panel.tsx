import { CreditCardIcon } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { prisma } from "@stagedesk/db";
import { amountDue, isStripeConfigured } from "@stagedesk/payments";
import { FormMessage } from "@/components/auth/auth-card";
import { RedirectButton, type RedirectResult } from "@/components/redirect-button";
import { euro } from "@/lib/format";

/**
 * What the customer still owes and, when the agency takes online payments, a
 * button to pay it through Stripe. `paid` is the ?paid= flag Stripe returns with.
 */
export async function PayPanel({
  booking,
  pay,
  paid,
}: {
  booking: { organizationId: string; status: string; totalCents: number; depositCents: number; paidCents: number };
  pay: () => Promise<RedirectResult>;
  paid?: string | string[];
}) {
  const [t, format] = await Promise.all([getTranslations("pay"), getFormatter()]);
  const due = ["booked", "confirmed", "completed"].includes(booking.status) ? amountDue(booking) : null;
  const online =
    due !== null &&
    isStripeConfigured() &&
    (await prisma.connectedAccount.count({ where: { organizationId: booking.organizationId, artistId: null, chargesEnabled: true } })) > 0;

  return (
    <>
      {paid === "1" && <FormMessage tone="success">{t("thanks")}</FormMessage>}
      {paid === "0" && <FormMessage>{t("cancelled")}</FormMessage>}
      {due &&
        (online ? (
          <div className="flex flex-wrap items-center gap-3">
            <RedirectButton action={pay}>
              <CreditCardIcon />
              {t(due.kind === "deposit" ? "payDeposit" : "payBalance", { amount: euro(format, due.amountCents) })}
            </RedirectButton>
            <span className="text-sm text-muted-foreground">{t("methods")}</span>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("offline")}</p>
        ))}
    </>
  );
}
