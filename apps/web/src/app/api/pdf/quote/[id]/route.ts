import { timingSafeEqual } from "node:crypto";
import { parseInvoiceTemplate, templateBackgroundAllowed } from "@stagedesk/core";
import { fromDateOnly, prisma } from "@stagedesk/db";
import { canOpenBooking, pdfLocale, pdfResponse, renderBookingPdf } from "@/lib/pdf/render";

function sameToken(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(request: Request, { params }: RouteContext<"/api/pdf/quote/[id]">) {
  const { id } = await params;
  const quote = await prisma.quote.findUnique({
    where: { id },
    include: {
      items: { orderBy: { position: "asc" } },
      organization: true,
      booking: { select: { trackingCode: true, currency: true, eventDate: true, customerId: true, organizationId: true, customer: { select: { name: true, email: true } } } },
    },
  });
  if (!quote) return new Response("Not found", { status: 404 });

  // Allowed with the customer's quote link, or for the agency and the booking's customer.
  const token = new URL(request.url).searchParams.get("token");
  const allowed = (token && sameToken(token, quote.token)) || (await canOpenBooking(request, quote.booking));
  if (!allowed) return new Response("Not found", { status: 404 });

  const a = quote.organization;
  const template = parseInvoiceTemplate(a.invoiceTemplate);
  if (!templateBackgroundAllowed(template.backgroundUrl, a.id)) template.backgroundUrl = null;
  const lang = new URL(request.url).searchParams.has("lang") ? pdfLocale(request) : quote.locale === "en" ? "en" : "nl";
  const buffer = await renderBookingPdf("quote", lang, {
    template,
    agency: { name: a.name, addressLine: a.addressLine, postalCode: a.postalCode, city: a.city, contactEmail: a.contactEmail, kvkNumber: a.kvkNumber, vatNumber: a.vatNumber, brandColor: a.brandColor, logo: a.logo },
    currency: quote.booking.currency,
    customer: quote.booking.customer,
    number: `${quote.booking.trackingCode}-${quote.version}`,
    issued: quote.sentAt ?? quote.createdAt,
    due: quote.expiresAt,
    reference: quote.booking.trackingCode,
    // The event the quote was made for (older quotes: the booking now).
    eventDate: (quote.eventSnapshot as { eventDate?: string | null } | null)?.eventDate ?? fromDateOnly(quote.booking.eventDate),
    lines: quote.items,
    vatGroups: quote.vatGroups as never,
    subtotalCents: quote.subtotalCents,
    totalCents: quote.totalCents,
    depositCents: quote.depositCents,
    notes: quote.notes,
  });
  return pdfResponse(buffer, `offerte-${quote.booking.trackingCode}-v${quote.version}.pdf`);
}
