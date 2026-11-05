import "server-only";
import { getTranslations } from "next-intl/server";
import { type VatGroup } from "@stagedesk/core";
import { bookingTypeName, fromDateOnly, prisma } from "@stagedesk/db";
import { agencySender, agencySenderSelect, customerMailLocale, type MailLocale } from "./correspondence";
import { absoluteUrl, appUrl, deliver } from "./mail";
import type { DeliveryReceipt } from "./deliver";

/**
 * Emails the customer their quote: what they get (every line, VAT, total,
 * upfront payment and balance), the event, how long it's valid, the link to
 * accept it and the PDF. Every amount is read from the saved quote, never
 * recalculated. The language is the one the quote was sent in, else the
 * customer's (see customerMailLocale).
 */
/** `displayName` replaces the agency name (an independent artist quoting under their stage name). */
export async function emailQuote(quoteId: string, displayName?: string): Promise<DeliveryReceipt | null> {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: {
      items: { orderBy: { position: "asc" } },
      organization: { select: { ...agencySenderSelect, phone: true, paymentInstructions: true } },
      booking: {
        select: {
          id: true,
          trackingCode: true,
          currency: true,
          eventType: true,
          eventDate: true,
          startTime: true,
          endTime: true,
          venueName: true,
          venueCity: true,
          customer: { select: { name: true, email: true, accounts: { where: { providerId: "credential" }, select: { id: true } } } },
        },
      },
    },
  });
  const customer = quote?.booking.customer;
  if (!quote || !customer) return null;
  const locale: MailLocale = quote.locale === "nl" || quote.locale === "en" ? quote.locale : (await customerMailLocale(quote.booking.id)).locale;
  const intl = locale === "en" ? "en-GB" : "nl-NL";
  const money = (cents: number) => new Intl.NumberFormat(intl, { style: "currency", currency: quote.booking.currency }).format(cents / 100);
  const qty = (hundredths: number) => new Intl.NumberFormat(intl, { maximumFractionDigits: 2 }).format(hundredths / 100);
  const pct = (bps: number) => new Intl.NumberFormat(intl, { style: "percent", maximumFractionDigits: 2 }).format(bps / 10_000);
  const snap = quote.eventSnapshot as { eventDate?: string | null; startTime?: string | null; endTime?: string | null; venueName?: string | null; venueCity?: string | null } | null;
  const day = snap ? (snap.eventDate ?? null) : fromDateOnly(quote.booking.eventDate);
  const eventName = await bookingTypeName(quote.booking.eventType, locale, quote.organizationId);
  const tb = await getTranslations({ locale, namespace: "booking" });
  const b = { ...quote.booking, ...(snap ? { startTime: snap.startTime ?? null, endTime: snap.endTime ?? null, venueName: snap.venueName ?? null, venueCity: snap.venueCity ?? null } : {}) };
  const date = day
    ? `${new Intl.DateTimeFormat(intl, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`))}${b.startTime ? `, ${b.startTime}${b.endTime ? `–${b.endTime}` : ""}` : ""}`
    : undefined;
  const org = quote.organization;

  // One email per quote version: a repeated action (double click, retry) stores nothing new.
  return deliver({
    kind: "quote",
    to: customer.email,
    sender: displayName ? { ...agencySender(org), name: displayName } : agencySender(org),
    params: {
      locale,
      name: customer.name.split(/\s+/)[0] ?? customer.name,
      agency: displayName || org.emailFromName?.trim() || org.name,
      total: money(quote.totalCents),
      until: new Intl.DateTimeFormat(intl, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(quote.expiresAt),
      url: absoluteUrl(locale, `/q/${quote.token}`),
      // No password yet: invite them to make their own account from the quote page.
      accountUrl: customer.accounts.length === 0 ? absoluteUrl(locale, `/q/${quote.token}#account`) : undefined,
      reference: b.trackingCode,
      event: eventName,
      date,
      venue: [b.venueName, b.venueCity].filter(Boolean).join(", ") || undefined,
      lines: quote.items.map((i) => ({ description: i.description, quantity: qty(i.quantityHundredths), unitPrice: money(i.unitPriceCents), total: money(i.subtotalCents) })),
      subtotal: money(quote.subtotalCents),
      vat: (quote.vatGroups as unknown as VatGroup[]).map((g) => ({ label: tb("vatLine", { rate: pct(g.rateBps) }), amount: money(g.vatCents) })),
      deposit: quote.depositCents > 0 ? money(quote.depositCents) : undefined,
      balance: quote.depositCents > 0 ? money(quote.totalCents - quote.depositCents) : undefined,
      notes: quote.notes ?? undefined,
      paymentTerms: org.paymentInstructions ?? undefined,
      contactEmail: org.emailReplyTo || org.contactEmail || undefined,
      contactPhone: org.phone ?? undefined,
      pdfUrl: `${appUrl}/api/pdf/quote/${quote.id}?token=${encodeURIComponent(quote.token)}&lang=${locale}`,
    },
  }, { key: `quote:${quote.id}`, agencyId: quote.organizationId, bookingId: quote.bookingId });
}
