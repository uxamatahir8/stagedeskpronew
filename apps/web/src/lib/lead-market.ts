import "server-only";
import { getTranslations } from "next-intl/server";
import type { EventType } from "@stagedesk/core";
import { broadcastLead, notify, prisma } from "@stagedesk/db";
import { absoluteUrl, deliver, userLocale } from "./mail";

const deskRoles = ["agency_owner", "agency_admin", "agency_staff"];

const longDate = (locale: "nl" | "en", date: Date | null) =>
  date ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date) : "—";

/** The people at each provider who handle requests, with their language. */
async function providerStaff(organizationIds: string[]) {
  if (organizationIds.length === 0) return [];
  return prisma.member.findMany({
    where: { organizationId: { in: organizationIds }, role: { in: deskRoles } },
    include: { user: { select: { email: true, locale: true } }, organization: { select: { name: true } } },
  });
}

/** Emails and notifies each provider's team that a request is waiting for their price. */
export async function announceLeadOffered(leadId: string, organizationIds: string[]) {
  const staff = await providerStaff(organizationIds);
  if (staff.length === 0) return;
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, select: { reference: true, eventType: true, eventDate: true, venueCity: true } });
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
        date: longDate(locale, lead.eventDate),
        city: lead.venueCity ?? "—",
        url: absoluteUrl(locale, "/app/lead-offers"),
      },
    });
  }
  await notify(
    staff.map((m) => m.userId),
    { type: "lead_offer", data: { code: lead.reference, city: lead.venueCity ?? "" }, url: "/app/lead-offers" },
  );
}

/** Sends a new request to every provider serving it, then tells them. Safe to run again: only new matches are told. */
export async function runLeadBroadcast(leadId: string) {
  const fresh = await broadcastLead(leadId);
  await announceLeadOffered(leadId, fresh);
  return fresh;
}

/** Tells the winner they've got the booking and everyone else that the customer chose someone else. */
export async function announceLeadDecided(lead: { reference: string; name: string; eventType: string }, winner: { id: string }, bookingCode: string, losers: string[]) {
  const [won, lost] = await Promise.all([providerStaff([winner.id]), providerStaff(losers)]);
  for (const m of won) {
    const locale = userLocale(m.user.locale);
    const te = await getTranslations({ locale, namespace: "eventTypes" });
    deliver({ kind: "leadWon", to: m.user.email, params: { locale, name: lead.name, event: te(lead.eventType as EventType).toLowerCase(), code: bookingCode, url: absoluteUrl(locale, `/app/bookings/${bookingCode}`) } });
  }
  for (const m of lost) {
    const locale = userLocale(m.user.locale);
    const te = await getTranslations({ locale, namespace: "eventTypes" });
    deliver({ kind: "leadLost", to: m.user.email, params: { locale, event: te(lead.eventType as EventType).toLowerCase(), reference: lead.reference, url: absoluteUrl(locale, "/app/lead-offers") } });
  }
}
