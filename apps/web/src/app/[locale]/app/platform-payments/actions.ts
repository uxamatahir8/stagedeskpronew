"use server";

import { getTranslations } from "next-intl/server";
import { getStripe, processStoredEvent } from "@stagedesk/payments";
import type { ActionResult } from "@/lib/actions";
import { paymentsErrorMessage } from "@/lib/billing";
import { requirePermission } from "@/lib/viewer";

/** Processes a stored Stripe event again, e.g. after a failure was fixed. */
export async function retryEventAction(eventId: string): Promise<ActionResult> {
  await requirePermission("platform.payments");
  const stripe = await getStripe();
  const t = await getTranslations("platformPayments");
  if (!stripe) return { ok: false, message: t("notConfigured") };
  try {
    await processStoredEvent(stripe, eventId);
    return { ok: true, message: t("retried") };
  } catch (error) {
    return { ok: false, message: await paymentsErrorMessage(error) };
  }
}
