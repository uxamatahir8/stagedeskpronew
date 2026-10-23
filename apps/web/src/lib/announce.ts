import "server-only";
import { getTranslations } from "next-intl/server";
import type { EventType } from "@stagedesk/core";
import { notify, prisma } from "@stagedesk/db";
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
    where: { organizationId, role: { in: ["agency_owner", "agency_admin", "agency_staff"] } },
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
