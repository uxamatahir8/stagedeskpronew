"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import type { EventType } from "@stagedesk/core";
import { audit, declineLeadOffer, getSetting, LeadError, MarketError, prisma, quoteLeadOffer, respondToLeadOffer } from "@stagedesk/db";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import type { ActionResult } from "@/lib/actions";
import { announceLeadAssigned } from "@/lib/announce";
import { writeBlocked } from "@/lib/billing";
import { absoluteUrl, deliver, userLocale } from "@/lib/mail";
import { parseQuoteLines, type QuoteDraft, quoteDraftSchema } from "@/lib/quote-input";
import { clientIp } from "@/lib/rate-limit";
import { requireAgency } from "@/lib/viewer";

async function errorMessage(error: unknown) {
  const t = await getTranslations("leadOffers");
  if (error instanceof LeadError || error instanceof MarketError) return t(`error_${error.code}`);
  throw error;
}

/** Takes a lead StageDesk offered directly (it becomes this agency's booking), or passes on any request. */
export async function respondLeadOfferAction(leadId: string, accept: boolean): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.leads");
  const t = await getTranslations("leadOffers");
  if (accept) {
    const blocked = await writeBlocked(organization.id);
    if (blocked) return { ok: false, message: blocked };
  }
  let code: string | null = null;
  try {
    if (accept) {
      const result = await respondToLeadOffer(leadId, organization.id, true, viewer.user.id);
      if (result.accepted) {
        await announceLeadAssigned(result.lead, result.booking, result.agency, viewer.user.id);
        code = result.booking.trackingCode;
      }
    } else {
      await declineLeadOffer(leadId, organization.id, viewer.user.id);
    }
    await audit({ actorId: viewer.user.id, action: accept ? "lead.accept" : "lead.decline", agencyId: organization.id, targetType: "lead", targetId: leadId, ip: clientIp(await headers()) });
  } catch (error) {
    return { ok: false, message: await errorMessage(error) };
  }
  revalidatePath("/[locale]/app/lead-offers", "page");
  if (code) redirect({ href: `/app/bookings/${code}`, locale: (await getLocale()) as Locale });
  return { ok: true, message: t("declined") };
}

/** Sends (or changes) this agency's price for a request; the customer gets an email to compare prices. */
export async function quoteLeadOfferAction(leadId: string, input: QuoteDraft): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.leads");
  const blocked = await writeBlocked(organization.id);
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("leadOffers");
  const parsed = quoteDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("error_invalid_quote") };
  const { vatRatesBps } = await getSetting("bookings.defaults");
  const lines = parseQuoteLines(parsed.data.lines, vatRatesBps);
  if ("badLine" in lines) return { ok: false, message: (await getTranslations("booking"))("invalidLine", { n: lines.badLine }) };

  let offer;
  try {
    offer = await quoteLeadOffer(
      leadId,
      organization.id,
      { lines: lines.lines, depositBps: Math.round(parsed.data.depositPct * 100), validDays: Math.min(60, parsed.data.expiresInDays), message: parsed.data.notes?.trim() || null },
      viewer.user.id,
    );
  } catch (error) {
    return { ok: false, message: await errorMessage(error) };
  }

  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, select: { name: true, email: true, locale: true, reference: true, accessToken: true, eventType: true } });
  const locale = userLocale(lead.locale);
  const te = await getTranslations({ locale, namespace: "eventTypes" });
  deliver({
    kind: "leadQuote",
    to: lead.email,
    params: {
      locale,
      name: lead.name.split(/\s+/)[0] ?? lead.name,
      provider: organization.name,
      event: te(lead.eventType as EventType).toLowerCase(),
      total: new Intl.NumberFormat(locale === "en" ? "en-GB" : "nl-NL", { style: "currency", currency: offer.currency ?? "EUR" }).format((offer.totalCents ?? 0) / 100),
      url: absoluteUrl(locale, `/request/${lead.reference}?t=${lead.accessToken}`),
    },
  });
  await audit({ actorId: viewer.user.id, action: "lead.quote", agencyId: organization.id, targetType: "lead", targetId: leadId, data: { totalCents: offer.totalCents }, ip: clientIp(await headers()) });
  revalidatePath("/[locale]/app/lead-offers", "page");
  return { ok: true, message: t("priceSent") };
}
