"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { assignLead, audit, closeLead, LeadError, offerLead, saveLeadNotes } from "@stagedesk/db";
import type { ActionResult } from "@/lib/actions";
import { announceLeadAssigned } from "@/lib/announce";
import { announceLeadOffered, runLeadBroadcast } from "@/lib/lead-market";
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
    await announceLeadOffered(leadId, fresh);
    await audit({ actorId: viewer.user.id, action: "lead.offer", targetType: "lead", targetId: leadId, data: { agencies: fresh }, ip: clientIp(await headers()) });
    done();
    return { ok: true, message: t("offered", { count: fresh.length }) };
  } catch (error) {
    return { ok: false, message: await leadError(error) };
  }
}

/** Sends the lead again to every provider whose area and event types match (e.g. after new agencies joined). */
export async function broadcastLeadAction(leadId: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.agencies");
  const t = await getTranslations("leads");
  const fresh = await runLeadBroadcast(leadId);
  await audit({ actorId: viewer.user.id, action: "lead.broadcast", targetType: "lead", targetId: leadId, data: { providers: fresh }, ip: clientIp(await headers()) });
  done();
  return { ok: true, message: t("broadcasted", { count: fresh.length }) };
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
