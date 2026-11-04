import "server-only";
import type { EmailSender } from "@stagedesk/emails";
import { prisma } from "@stagedesk/db";

export type MailLocale = "nl" | "en";
const asLocale = (value: string | null | undefined): MailLocale | null => (value === "nl" || value === "en" ? value : null);

/** Bookings whose customer filled in a form themselves, in the language of that form. */
const selfServiceSources = new Set(["booking_page", "lead", "gig", "profile", "customer_portal"]);

/**
 * The language a booking's customer should get mail in, and why:
 * - "customer": they chose it (signed in to StageDesk, or filled in a public form in it);
 * - "agency": the agency's correspondence language, for customers the agency
 *   entered itself, whose stored language is only the column's default.
 * An agency can still pick another language when it sends a quote.
 */
export async function customerMailLocale(bookingId: string): Promise<{ locale: MailLocale; reason: "customer" | "agency" }> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      source: true,
      organization: { select: { correspondenceLocale: true } },
      customer: { select: { locale: true, _count: { select: { sessions: true, accounts: true } } } },
    },
  });
  const agency = asLocale(booking?.organization.correspondenceLocale) ?? "nl";
  const customer = booking?.customer;
  const own = asLocale(customer?.locale);
  if (own && customer && (customer._count.sessions + customer._count.accounts > 0 || selfServiceSources.has(booking!.source))) {
    return { locale: own, reason: "customer" };
  }
  return { locale: agency, reason: "agency" };
}

/** How the agency's customer mail is signed: its name (or chosen display name) and where replies go. */
export function agencySender(org: { name: string; emailFromName: string | null; emailReplyTo: string | null; contactEmail: string | null }): EmailSender {
  return { name: org.emailFromName?.trim() || org.name, replyTo: org.emailReplyTo || org.contactEmail };
}

export const agencySenderSelect = { name: true, emailFromName: true, emailReplyTo: true, contactEmail: true } as const;

/** The language a booking's customer gets mail in: the one its latest quote went out in, else customerMailLocale(). */
export async function bookingMailLocale(bookingId: string): Promise<MailLocale> {
  const quote = await prisma.quote.findFirst({ where: { bookingId, status: { in: ["sent", "accepted"] }, locale: { not: null } }, orderBy: { version: "desc" }, select: { locale: true } });
  return asLocale(quote?.locale) ?? (await customerMailLocale(bookingId)).locale;
}
