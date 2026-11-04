import "server-only";
import { getTranslations } from "next-intl/server";
import type { EventType, QuoteEventField } from "@stagedesk/core";
import { prisma } from "@stagedesk/db";
import { agencySender, agencySenderSelect, bookingMailLocale } from "./correspondence";
import { eventDate } from "./format";
import type { getFormatter } from "./formatter";
import { absoluteUrl, accepted, deliver } from "./mail";

export interface ChangeRow {
  field: QuoteEventField;
  label: string;
  from: string;
  to: string;
  /** What the booking says now; only passed for the agency, who decides. */
  now?: string;
}

/** A stored change request as lines people can read: which field, what it was and what it would become. */
export async function changeRows(changes: unknown, baseline: unknown, format: Awaited<ReturnType<typeof getFormatter>>, current?: Record<string, unknown>): Promise<ChangeRow[]> {
  const t = await getTranslations();
  const shown = (field: QuoteEventField, value: unknown) => {
    if (value === null || value === undefined || value === "") return "—";
    if (field === "eventType") return t(`eventTypes.${value as EventType}`);
    if (field === "eventDate") return eventDate(format, new Date(`${String(value)}T00:00:00Z`)) ?? String(value);
    return String(value);
  };
  const before = (baseline ?? {}) as Record<string, unknown>;
  return Object.entries((changes ?? {}) as Record<string, unknown>).map(([key, value]) => {
    const field = key as QuoteEventField;
    const label = t(`booking.field_${field}`);
    return { field, label: label.charAt(0).toUpperCase() + label.slice(1), from: shown(field, before[field]), to: shown(field, value), ...(current ? { now: shown(field, current[field]) } : {}) };
  });
}

/**
 * Tells the customer what the agency decided, in the customer's language and from
 * the booking as it is now. Durable and keyed by request and decision, so a retry
 * can't send a second one; the decision stands whatever happens here. Returns
 * false when the message couldn't be stored or handed on, so the agency can be told.
 */
export async function emailChangeDecision(decision: { bookingId: string; requestId: string; approved: boolean; changes: unknown; baseline: unknown; note: string | null }) {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: decision.bookingId },
    include: { customer: { select: { name: true, email: true, disabledAt: true } }, organization: { select: { ...agencySenderSelect, phone: true } } },
  });
  // Nobody to write to; the in-app notification and the timeline still say what happened.
  if (!booking.customer || booking.customer.disabledAt) return true;
  const locale = await bookingMailLocale(booking.id);
  const t = await getTranslations({ locale });
  const intl = locale === "en" ? "en-GB" : "nl-NL";
  const day = (value: unknown) => new Intl.DateTimeFormat(intl, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${String(value)}T12:00:00Z`));
  const shown = (field: QuoteEventField, value: unknown) => {
    if (value === null || value === undefined || value === "") return "—";
    if (field === "eventType") return t(`eventTypes.${value as EventType}`);
    return field === "eventDate" ? day(value) : String(value);
  };
  const label = (field: QuoteEventField) => {
    const text = t(`booking.field_${field}`);
    return text.charAt(0).toUpperCase() + text.slice(1);
  };
  const before = (decision.baseline ?? {}) as Record<string, unknown>;
  const changes = Object.entries((decision.changes ?? {}) as Record<string, unknown>).map(([key, value]) => {
    const field = key as QuoteEventField;
    return decision.approved ? `${label(field)}: ${shown(field, before[field])} → ${shown(field, value)}` : `${label(field)}: ${shown(field, value)}`;
  });
  const time = booking.startTime ? `${booking.startTime}${booking.endTime ? `–${booking.endTime}` : ""}` : null;
  const venue = [booking.venueName, booking.venueAddress, booking.venueCity].filter(Boolean).join(", ");
  const details = [
    `${label("eventDate")}: ${booking.eventDate ? day(booking.eventDate.toISOString().slice(0, 10)) : t("bookings.noDate")}`,
    time && `${label("startTime")}: ${time}`,
    venue && `${label("venueName")}: ${venue}`,
    booking.guestCount && `${label("guestCount")}: ${booking.guestCount}`,
  ].filter((line): line is string => Boolean(line));
  const org = booking.organization;
  const agency = org.emailFromName?.trim() || org.name;
  const receipt = await deliver(
    {
      kind: "changeDecision",
      to: booking.customer.email,
      sender: agencySender(org),
      params: {
        locale,
        name: booking.customer.name.split(/\s+/)[0] ?? booking.customer.name,
        agency,
        code: booking.trackingCode,
        event: t(`eventTypes.${booking.eventType as EventType}`).toLowerCase(),
        approved: decision.approved,
        changes,
        details,
        note: decision.note,
        contact: [org.contactEmail, org.phone].filter(Boolean).join(" · ") || null,
        url: absoluteUrl(locale, `/app/event?booking=${booking.trackingCode}`),
      },
    },
    { key: `change-decision:${decision.requestId}:${decision.approved ? "approved" : "rejected"}`, agencyId: booking.organizationId, bookingId: booking.id },
  );
  return accepted(receipt);
}
