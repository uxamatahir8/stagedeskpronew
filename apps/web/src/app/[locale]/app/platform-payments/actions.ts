"use server";

import { getTranslations } from "next-intl/server";
import { audit, prisma } from "@stagedesk/db";
import { closeRefundWithShortfall, executePayout, executeRefund, getStripe, processStoredEvent, replayStripeEvent, resetOperation } from "@stagedesk/payments";
import type { ActionResult } from "@/lib/actions";
import { paymentsErrorMessage } from "@/lib/billing";
import { requirePermission } from "@/lib/viewer";

/** Processes a stored Stripe event again, e.g. after a failure was fixed. Handlers are idempotent. */
export async function retryEventAction(eventId: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.payments");
  const stripe = await getStripe();
  const t = await getTranslations("platformPayments");
  if (!stripe) return { ok: false, message: t("notConfigured") };
  try {
    await replayStripeEvent(eventId);
    const status = await processStoredEvent(stripe, eventId);
    await audit({ actorId: viewer.user.id, action: "payment.event_replayed", targetType: "stripe_event", targetId: eventId, data: { status } });
    return { ok: true, message: t("retried") };
  } catch (error) {
    return { ok: false, message: await paymentsErrorMessage(error) };
  }
}

/** Continues a stuck refund or payout now (same Stripe keys; nothing is sent twice). */
export async function retryOperationAction(operationId: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.payments");
  const stripe = await getStripe();
  const t = await getTranslations("platformPayments");
  if (!stripe) return { ok: false, message: t("notConfigured") };
  const op = await prisma.financialOperation.findUnique({ where: { id: operationId }, select: { kind: true } });
  if (!op || !(await resetOperation(operationId))) return { ok: false, message: t("opNotOpen") };
  await audit({ actorId: viewer.user.id, action: "payment.operation_retried", targetType: "financial_operation", targetId: operationId });
  try {
    const status = op.kind === "refund" ? (await executeRefund(stripe, operationId)).status : (await executePayout(stripe, operationId)).status;
    return status === "completed" ? { ok: true, message: t("opCompleted") } : { ok: false, message: t("opStillOpen") };
  } catch (error) {
    return { ok: false, message: await paymentsErrorMessage(error) };
  }
}

/** Books a refund whose transfer reversal can't be made; the platform carries the missing part. */
export async function closeShortfallAction(operationId: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.payments");
  const t = await getTranslations("platformPayments");
  try {
    await closeRefundWithShortfall(operationId);
    await audit({ actorId: viewer.user.id, action: "payment.operation_closed", targetType: "financial_operation", targetId: operationId });
    return { ok: true, message: t("opCompleted") };
  } catch (error) {
    return { ok: false, message: await paymentsErrorMessage(error) };
  }
}
