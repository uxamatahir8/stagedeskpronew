import "server-only";
import { deskRoles } from "@stagedesk/core";
import { bookingTypeName, prisma } from "@stagedesk/db";
import { agencySender, agencySenderSelect, bookingMailLocale, type MailLocale } from "./correspondence";
import { absoluteUrl, deliver, userLocale } from "./mail";

const longDate = (locale: MailLocale, date: Date | null) =>
  date ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date) : "";

const bookingForMail = (bookingId: string) =>
  prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      organizationId: true,
      trackingCode: true,
      eventType: true,
      eventDate: true,
      customer: { select: { name: true, email: true } },
      organization: { select: agencySenderSelect },
      quotes: { where: { status: "accepted" }, select: { token: true }, take: 1 },
    },
  });

/** A step in the booking, emailed to the customer in their language. Never throws: the step itself already happened. */
export async function mailCustomer(bookingId: string, update: "bookingConfirmed" | "bookingCancelled" | "invoiceIssued" | "reviewInvitation", opts: { reason?: string | null } = {}) {
  try {
    const booking = await bookingForMail(bookingId);
    if (!booking?.customer) return;
    const locale = await bookingMailLocale(bookingId);
    const token = booking.quotes[0]?.token;
    // The quote link needs no account, so the invoice can be opened from the email by anyone who has it.
    const path = update === "invoiceIssued" && token ? `/q/${encodeURIComponent(token)}` : `/app/event?booking=${booking.trackingCode}`;
    const event = (await bookingTypeName(booking.eventType, locale, booking.organizationId)).toLowerCase();
    deliver({
      kind: update,
      to: booking.customer.email,
      sender: agencySender(booking.organization),
      params: {
        locale,
        update,
        name: booking.customer.name,
        agency: booking.organization.name,
        code: booking.trackingCode,
        event,
        date: longDate(locale, booking.eventDate),
        reason: opts.reason ?? "",
        url: absoluteUrl(locale, path),
      },
    }, { bookingId, agencyId: booking.organizationId });
  } catch (error) {
    console.error("[mail] booking update for the customer failed", update, bookingId, error);
  }
}

/** A step in the booking, emailed to everyone at the agency who handles bookings. Never throws, as above. */
export async function mailAgencyTeam(bookingId: string, update: "quoteAccepted" | "artistAccepted" | "artistDeclined", opts: { artist?: string; reason?: string | null } = {}) {
  try {
    const booking = await bookingForMail(bookingId);
    if (!booking) return;
    const staff = await prisma.member.findMany({ where: { organizationId: booking.organizationId, role: { in: [...deskRoles] } }, include: { user: { select: { email: true, locale: true } } } });
    const kind = update === "quoteAccepted" ? "quoteAcceptedNotice" : update === "artistAccepted" ? "artistAcceptedNotice" : "artistDeclinedNotice";
    for (const member of staff) {
      const locale = userLocale(member.user.locale);
      deliver({
        kind,
        to: member.user.email,
        params: {
          locale,
          update,
          customer: booking.customer?.name ?? "",
          artist: opts.artist ?? "",
          code: booking.trackingCode,
          event: (await bookingTypeName(booking.eventType, locale, booking.organizationId)).toLowerCase(),
          date: longDate(locale, booking.eventDate),
          reason: opts.reason ?? "",
          url: absoluteUrl(locale, `/app/bookings/${booking.trackingCode}`),
        },
      }, { bookingId, agencyId: booking.organizationId });
    }
  } catch (error) {
    console.error("[mail] booking update for the agency failed", update, bookingId, error);
  }
}
