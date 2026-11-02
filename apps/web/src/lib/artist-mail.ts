import "server-only";
import { getTranslations } from "next-intl/server";
import type { EventType } from "@stagedesk/core";
import { fromDateOnly, prisma } from "@stagedesk/db";
import { absoluteUrl, deliver, userLocale } from "./mail";
import { hasPassword, passwordSetupUrl } from "./password-setup";

/**
 * Emails artists about their bookings: a new request (with a first-password
 * link for an account created for them), being taken off a booking, or the
 * booking being cancelled. Each email has a job id per assignment and kind,
 * so a repeated action never queues it twice. Artists without an account get
 * nothing (there is no one to write to).
 */
export async function emailArtists(assignmentIds: string[], status: "new" | "withdrawn" | "cancelled") {
  if (assignmentIds.length === 0) return;
  const rows = await prisma.bookingAssignment.findMany({
    where: { id: { in: assignmentIds } },
    select: {
      id: true,
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
    // An account made for the artist has no password yet: the button lets them choose one first.
    const setupUrl = status === "new" && !(await hasPassword(user.id)) ? await passwordSetupUrl(user.id, locale) : undefined;
    deliver(
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
      { jobId: `gig-${status}-${row.id}` },
    );
  }
}
