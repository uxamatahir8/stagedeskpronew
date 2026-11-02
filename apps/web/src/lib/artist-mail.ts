import "server-only";
import { getTranslations } from "next-intl/server";
import type { EventType } from "@stagedesk/core";
import { fromDateOnly, prisma } from "@stagedesk/db";
import { absoluteUrl, accepted, deliver, userLocale } from "./mail";
import { hasPassword, passwordSetupUrl } from "./password-setup";

/**
 * Emails artists about their bookings: a new request (with a first-password
 * link for an account created for them), being taken off a booking, or the
 * booking being cancelled. Each email has an outbox key per assignment and
 * kind, so a repeated action (or a retry) stores and sends it once. Artists
 * without an account get nothing (there is no one to write to). Returns
 * false when an email couldn't be stored or queued.
 */
export async function emailArtists(assignmentIds: string[], status: "new" | "withdrawn" | "cancelled") {
  /** How many of the artists' emails are stored or queued (false: one couldn't be accepted). */
  let allAccepted = true;
  if (assignmentIds.length === 0) return allAccepted;
  const rows = await prisma.bookingAssignment.findMany({
    where: { id: { in: assignmentIds } },
    select: {
      id: true,
      organizationId: true,
      bookingId: true,
      artist: { select: { stageName: true, user: { select: { id: true, email: true, name: true, locale: true, disabledAt: true } } } },
      organization: { select: { name: true } },
      booking: { select: { trackingCode: true, eventType: true, eventDate: true, startTime: true, venueName: true, venueCity: true } },
    },
  });
  for (const row of rows) {
    const user = row.artist.user;
    if (!user || user.disabledAt) continue;
    const locale = userLocale(user.locale);
    const te = await getTranslations({ locale, namespace: "eventTypes" });
    const day = fromDateOnly(row.booking.eventDate);
    const intl = locale === "en" ? "en-GB" : "nl-NL";
    const date = day
      ? `${new Intl.DateTimeFormat(intl, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`))}${row.booking.startTime ? `, ${row.booking.startTime}` : ""}`
      : te("other").toLowerCase();
    const url = absoluteUrl(locale, status === "new" ? `/app/gigs/${row.booking.trackingCode}` : "/app/gigs");
    const key = `gig-${status}-${row.id}`;
    // Already stored (a repeated action): don't make another setup link either.
    if (await prisma.emailMessage.count({ where: { key } })) continue;
    // An account made for the artist has no password yet: the button lets them choose one first.
    const setupUrl = status === "new" && !(await hasPassword(user.id)) ? await passwordSetupUrl(user.id, locale) : undefined;
    const receipt = await deliver(
      {
        kind: "gigAssigned",
        to: user.email,
        params: {
          locale,
          status,
          name: row.artist.stageName || user.name,
          agency: row.organization.name,
          event: te(row.booking.eventType as EventType).toLowerCase(),
          date,
          venue: [row.booking.venueName, row.booking.venueCity].filter(Boolean).join(", "),
          url,
          setupUrl,
        },
      },
      { key, agencyId: row.organizationId, bookingId: row.bookingId },
    );
    if (!accepted(receipt)) allAccepted = false;
  }
  return allAccepted;
}
