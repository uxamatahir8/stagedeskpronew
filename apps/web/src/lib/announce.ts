import "server-only";
import { getTranslations } from "next-intl/server";
import { deskRoles, type EventType } from "@stagedesk/core";
import { notify, platformAdminIds, prisma } from "@stagedesk/db";
import { absoluteUrl, deliver, userLocale } from "./mail";

/**
 * Tells everyone who handles bookings at the agency about a new booking: an
 * email in each person's own language and an in-app notification. Used by the
 * public booking page, bookings a platform admin creates, and accepted leads.
 */
export async function announceNewBooking(
  organizationId: string,
  booking: { trackingCode: string; eventType: string; eventDate: Date | string | null },
  customerName: string,
  exceptUserId?: string | null,
) {
  const staff = await prisma.member.findMany({
    where: { organizationId, role: { in: [...deskRoles] } },
    include: { user: { select: { email: true, locale: true } } },
  });
  const date = booking.eventDate ? new Date(typeof booking.eventDate === "string" ? `${booking.eventDate}T12:00:00Z` : booking.eventDate) : null;
  for (const member of staff) {
    if (member.userId === exceptUserId) continue;
    const locale = userLocale(member.user.locale);
    const tt = await getTranslations({ locale, namespace: "eventTypes" });
    deliver({
      kind: "newInquiry",
      to: member.user.email,
      params: {
        locale,
        customer: customerName,
        event: tt(booking.eventType as EventType).toLowerCase(),
        date: date ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date) : "—",
        url: absoluteUrl(locale, `/app/bookings/${booking.trackingCode}`),
      },
    });
  }
  await notify(
    staff.map((m) => m.userId),
    { type: "new_inquiry", data: { name: customerName, code: booking.trackingCode }, url: `/app/bookings/${booking.trackingCode}` },
    exceptUserId,
  );
}

/**
 * After a lead became a booking (assigned by the admin or accepted by the
 * agency): the agency team hears about it, the customer gets the agency's
 * confirmation, and the platform admins see who took it.
 */
export async function announceLeadAssigned(
  lead: { id: string; name: string; email: string; locale: string; reference: string },
  booking: { trackingCode: string; eventType: string; eventDate: Date | string | null },
  agency: { id: string; name: string },
  actorId: string | null,
) {
  await announceNewBooking(agency.id, booking, lead.name, actorId);
  const locale = userLocale(lead.locale);
  deliver({
    kind: "inquiryReceived",
    to: lead.email,
    params: {
      locale,
      name: lead.name.split(/\s+/)[0] ?? lead.name,
      agency: agency.name,
      code: booking.trackingCode,
      url: absoluteUrl(locale, `/sign-in?next=${encodeURIComponent("/app/event")}`),
    },
  });
  await notify(await platformAdminIds(), { type: "lead_accepted", data: { name: agency.name, code: lead.reference }, url: `/app/leads/${lead.id}` }, actorId);
}
