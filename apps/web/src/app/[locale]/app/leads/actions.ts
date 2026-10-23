"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import type { EventType } from "@stagedesk/core";
import { assignLead, audit, closeLead, LeadError, notify, offerLead, prisma, saveLeadNotes } from "@stagedesk/db";
import type { ActionResult } from "@/lib/actions";
import { announceLeadAssigned } from "@/lib/announce";
import { absoluteUrl, deliver, userLocale } from "@/lib/mail";
import { clientIp } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/viewer";

async function leadError(error: unknown) {
  const t = await getTranslations("leads");
  if (error instanceof LeadError) return t(`error_${error.code}`);
  throw error;
}

function done() {
  revalidatePath("/[locale]/app/leads", "page");
  revalidatePath("/[locale]/app/leads/[id]", "page");
}

/** Offers the lead to the chosen agencies; each agency team gets an email and a notification. */
export async function offerLeadAction(leadId: string, agencyIds: string[]): Promise<ActionResult> {
  const viewer = await requirePermission("platform.agencies");
  const t = await getTranslations("leads");
  if (agencyIds.length === 0) return { ok: false, message: t("chooseAgencies") };
  try {
    const fresh = await offerLead(leadId, agencyIds.slice(0, 20));
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, select: { reference: true, eventType: true, eventDate: true, venueCity: true } });
    const staff = await prisma.member.findMany({
      where: { organizationId: { in: fresh }, role: { in: ["agency_owner", "agency_admin", "agency_staff"] } },
      include: { user: { select: { email: true, locale: true } }, organization: { select: { name: true } } },
    });
    for (const m of staff) {
      const locale = userLocale(m.user.locale);
      const te = await getTranslations({ locale, namespace: "eventTypes" });
      deliver({
        kind: "leadOffer",
        to: m.user.email,
        params: {
          locale,
          agency: m.organization.name,
          event: te(lead.eventType as EventType).toLowerCase(),
          date: lead.eventDate ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(lead.eventDate) : "—",
          city: lead.venueCity ?? "—",
          url: absoluteUrl(locale, "/app/lead-offers"),
        },
      });
    }
    await notify(
      staff.map((m) => m.userId),
      { type: "lead_offer", data: { code: lead.reference, city: lead.venueCity ?? "" }, url: "/app/lead-offers" },
    );
    await audit({ actorId: viewer.user.id, action: "lead.offer", targetType: "lead", targetId: leadId, data: { agencies: fresh }, ip: clientIp(await headers()) });
    done();
    return { ok: true, message: t("offered", { count: fresh.length }) };
  } catch (error) {
    return { ok: false, message: await leadError(error) };
  }
}

/** Gives the lead straight to one agency, without waiting for them to accept. */
export async function assignLeadAction(leadId: string, agencyId: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.agencies");
  const t = await getTranslations("leads");
  try {
    const { lead, booking, agency } = await assignLead(leadId, agencyId, viewer.user.id);
    await announceLeadAssigned(lead, booking, agency, viewer.user.id);
    await audit({ actorId: viewer.user.id, action: "lead.assign", agencyId, targetType: "lead", targetId: leadId, data: { booking: booking.trackingCode }, ip: clientIp(await headers()) });
    done();
    return { ok: true, message: t("assigned", { agency: agency.name, code: booking.trackingCode }) };
  } catch (error) {
    return { ok: false, message: await leadError(error) };
  }
}

export async function closeLeadAction(leadId: string, reason: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.agencies");
  const t = await getTranslations("leads");
  try {
    await closeLead(leadId, reason.trim() || null);
    await audit({ actorId: viewer.user.id, action: "lead.close", targetType: "lead", targetId: leadId, data: { reason: reason.trim() || null }, ip: clientIp(await headers()) });
    done();
    return { ok: true, message: t("closed") };
  } catch (error) {
    return { ok: false, message: await leadError(error) };
  }
}

export async function saveLeadNotesAction(leadId: string, notes: string): Promise<ActionResult> {
  await requirePermission("platform.agencies");
  const t = await getTranslations("leads");
  await saveLeadNotes(leadId, notes);
  done();
  return { ok: true, message: t("notesSaved") };
}
