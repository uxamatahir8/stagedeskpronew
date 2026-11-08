import { parseInvoiceTemplate, templateBackgroundAllowed } from "@stagedesk/core";
import { prisma } from "@stagedesk/db";
import { canOpenBooking, type PdfLine, pdfLocale, pdfResponse, quoteLinkOpens, renderBookingPdf } from "@/lib/pdf/render";

interface InvoiceSnapshot {
  agency: {
    name: string;
    kvkNumber: string | null;
    vatNumber: string | null;
    addressLine: string | null;
    postalCode: string | null;
    city: string | null;
    contactEmail: string | null;
    logo: string | null;
    // In snapshots from 2026-11 on.
    iban?: string | null;
    bankAccountName?: string | null;
    paymentInstructions?: string | null;
  };
  /** The look when issued (null on invoices from before templates). */
  template?: unknown;
  locale?: string | null;
  customer: { name: string; email: string } | null;
  trackingCode: string;
  eventDate: string | null;
  lines: PdfLine[];
  vatGroups: { rateBps: number; baseCents: number; vatCents: number }[];
}

export async function GET(request: Request, { params }: RouteContext<"/api/pdf/invoice/[id]">) {
  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { booking: { select: { organizationId: true, customerId: true, paidCents: true, currency: true } }, organization: { select: { brandColor: true } } },
  });
  if (!invoice || !((await quoteLinkOpens(request, invoice.bookingId)) || (await canOpenBooking(request, invoice.booking)))) return new Response("Not found", { status: 404 });

  // The invoice is printed from its snapshot, so later edits to the agency or quote don't change it.
  const snap = invoice.data as unknown as InvoiceSnapshot;
  const template = parseInvoiceTemplate(snap.template);
  if (!templateBackgroundAllowed(template.backgroundUrl, invoice.organizationId)) template.backgroundUrl = null;
  // An explicit ?lang wins; otherwise the language the quote was sent in.
  const lang = new URL(request.url).searchParams.has("lang") ? pdfLocale(request) : snap.locale === "en" ? "en" : "nl";
  const buffer = await renderBookingPdf("invoice", lang, {
    agency: { ...snap.agency, brandColor: invoice.organization.brandColor },
    template,
    payment: { iban: snap.agency.iban, accountName: snap.agency.bankAccountName, instructions: snap.agency.paymentInstructions },
    currency: invoice.booking.currency,
    customer: snap.customer,
    number: invoice.number,
    issued: invoice.issuedAt,
    due: invoice.dueAt,
    reference: snap.trackingCode,
    eventDate: snap.eventDate,
    lines: snap.lines,
    vatGroups: snap.vatGroups,
    subtotalCents: invoice.subtotalCents,
    totalCents: invoice.totalCents,
    paidCents: invoice.booking.paidCents,
  });
  return pdfResponse(buffer, `factuur-${invoice.number}.pdf`);
}
