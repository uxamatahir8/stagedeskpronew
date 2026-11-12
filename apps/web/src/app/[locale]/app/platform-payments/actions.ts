"use server";

import { getTranslations } from "next-intl/server";
import { audit, prisma } from "@stagedesk/db";
import { closeRefundWithShortfall, executePayout, executeRefund, getStripe, processStoredEvent, replayStripeEvent, resetOperation, resolveBillingIncident, syncAgencySubscriptions } from "@stagedesk/payments";
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

/** Re-reads the agency's subscriptions from Stripe and applies the rule (the incident resolves itself once one is left). */
export async function reconcileSubscriptionsAction(agencyId: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.payments");
  const stripe = await getStripe();
  const t = await getTranslations("platformPayments");
  if (!stripe) return { ok: false, message: t("notConfigured") };
  const org = await prisma.organization.findUnique({ where: { id: agencyId }, select: { stripeCustomerId: true } });
  if (!org?.stripeCustomerId) return { ok: false, message: t("opNotOpen") };
  try {
    const result = await syncAgencySubscriptions(stripe, org.stripeCustomerId);
    await audit({ actorId: viewer.user.id, action: "payment.subscription_reconciled", agencyId, data: { chosen: result?.chosen ?? null, duplicates: result?.duplicates ?? [] } });
    return { ok: true, message: result && result.duplicates.length > 0 ? t("incidentStillOpen", { count: result.duplicates.length + 1 }) : t("incidentResolved") };
  } catch (error) {
    return { ok: false, message: await paymentsErrorMessage(error) };
  }
}

/** The operator handled it in Stripe (cancelled one, refunded): close the incident. A later sync reopens it if two are still live. */
export async function resolveIncidentAction(incidentId: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.payments");
  const t = await getTranslations("platformPayments");
  if (!(await resolveBillingIncident(incidentId, viewer.user.id, null))) return { ok: false, message: t("opNotOpen") };
  await audit({ actorId: viewer.user.id, action: "payment.incident_resolved", targetType: "billing_incident", targetId: incidentId });
  return { ok: true, message: t("incidentResolved") };
}
