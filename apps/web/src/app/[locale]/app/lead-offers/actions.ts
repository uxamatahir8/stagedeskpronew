"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { audit, LeadError, respondToLeadOffer } from "@stagedesk/db";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { ActionResult } from "@/lib/actions";
import { announceLeadAssigned } from "@/lib/announce";
import { writeBlocked } from "@/lib/billing";
import { clientIp } from "@/lib/rate-limit";
import { requireAgency } from "@/lib/viewer";

/** The agency takes a lead (it becomes their booking) or passes on it. */
export async function respondLeadOfferAction(leadId: string, accept: boolean): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.bookings");
  const t = await getTranslations("leadOffers");
  if (accept) {
    const blocked = await writeBlocked(organization.id);
    if (blocked) return { ok: false, message: blocked };
  }
  let code: string | null = null;
  try {
    const result = await respondToLeadOffer(leadId, organization.id, accept, viewer.user.id);
    if (result.accepted) {
      await announceLeadAssigned(result.lead, result.booking, result.agency, viewer.user.id);
      code = result.booking.trackingCode;
    }
    await audit({ actorId: viewer.user.id, action: accept ? "lead.accept" : "lead.decline", agencyId: organization.id, targetType: "lead", targetId: leadId, ip: clientIp(await headers()) });
  } catch (error) {
    if (error instanceof LeadError) return { ok: false, message: t(`error_${error.code}`) };
    throw error;
  }
  revalidatePath("/[locale]/app/lead-offers", "page");
  if (code) redirect({ href: `/app/bookings/${code}`, locale: (await getLocale()) as Locale });
  return { ok: true, message: t("declined") };
}
