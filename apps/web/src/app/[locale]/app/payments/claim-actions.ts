"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { audit, BookingError, confirmPaymentClaim, PaymentClaimError, rejectPaymentClaim } from "@stagedesk/db";
import type { ActionResult } from "@/lib/actions";
import { writeBlocked } from "@/lib/billing";
import { announceRejected, sendReceipt } from "@/lib/payment-claims";
import { clientIp } from "@/lib/rate-limit";
import { requireAgency } from "@/lib/viewer";

function done() {
  revalidatePath("/[locale]/app/payments", "page");
  revalidatePath("/[locale]/app/bookings/[code]", "page");
  revalidatePath("/[locale]/app", "page");
}

/** The money is in: records the payment and sends the customer a receipt. */
export async function confirmClaimAction(claimId: string, receivedOn?: string): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.payments.confirm");
  const t = await getTranslations("paymentClaims");
  const blocked = await writeBlocked(organization.id);
  if (blocked) return { ok: false, message: blocked };
  if (receivedOn && !/^\d{4}-\d{2}-\d{2}$/.test(receivedOn)) return { ok: false, message: t("invalidDate") };
  try {
    const { claim, payment } = await confirmPaymentClaim(organization.id, claimId, viewer.user.id, receivedOn);
    await sendReceipt({ organizationId: organization.id, bookingId: claim.bookingId, amountCents: payment.amountCents, method: payment.method, receivedAt: payment.receivedAt });
    await audit({ actorId: viewer.user.id, action: "payment.claim_confirm", agencyId: organization.id, targetType: "payment", targetId: payment.id, data: { cents: payment.amountCents }, ip: clientIp(await headers()) });
    done();
    return { ok: true, message: t("confirmed") };
  } catch (error) {
    if (error instanceof PaymentClaimError) return { ok: false, message: t(`error_${error.code}`) };
    if (error instanceof BookingError) return { ok: false, message: t("error_not_payable") };
    throw error;
  }
}

/** Not (yet) received: the customer is told, with the reason. */
export async function rejectClaimAction(claimId: string, reason: string): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.payments.confirm");
  const t = await getTranslations("paymentClaims");
  if (!reason.trim()) return { ok: false, message: t("reasonRequired") };
  try {
    const claim = await rejectPaymentClaim(organization.id, claimId, viewer.user.id, reason);
    await announceRejected(claim);
    await audit({ actorId: viewer.user.id, action: "payment.claim_reject", agencyId: organization.id, targetType: "booking", targetId: claim.bookingId, data: { cents: claim.amountCents }, ip: clientIp(await headers()) });
    done();
    return { ok: true, message: t("rejected") };
  } catch (error) {
    if (error instanceof PaymentClaimError) return { ok: false, message: t(`error_${error.code}`) };
    throw error;
  }
}
