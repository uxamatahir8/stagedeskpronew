"use server";

import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { acceptLeadOffer, audit, MarketError } from "@stagedesk/db";
import type { ActionResult } from "@/lib/actions";
import { announceLeadAssigned } from "@/lib/announce";
import { announceLeadDecided } from "@/lib/lead-market";
import { allow, clientIp } from "@/lib/rate-limit";

/** The customer accepts one provider's price from their request page (the link in their email is the key). */
export async function acceptLeadOfferAction(reference: string, token: string, offerId: string): Promise<ActionResult> {
  const t = await getTranslations("leadCompare");
  const ip = clientIp(await headers());
  if (!(await allow(`lead-accept:${ip}`, 10, 3600))) return { ok: false, message: t("error_rate") };
  try {
    const { lead, booking, agency, lostTo } = await acceptLeadOffer(reference, token, offerId);
    await announceLeadAssigned(lead, booking, agency, null);
    await announceLeadDecided(lead, agency, booking.trackingCode, lostTo);
    await audit({ actorId: null, action: "lead.customer_accept", agencyId: agency.id, targetType: "lead", targetId: lead.id, data: { booking: booking.trackingCode }, ip });
    return { ok: true, message: t("acceptedToast", { provider: agency.name }) };
  } catch (error) {
    if (error instanceof MarketError) return { ok: false, message: t(`error_${error.code}`) };
    throw error;
  }
}
