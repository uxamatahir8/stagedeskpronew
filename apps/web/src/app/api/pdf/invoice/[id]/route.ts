import { prisma } from "@stagedesk/db";
import { canOpenBooking, type PdfLine, pdfLocale, pdfResponse, renderBookingPdf } from "@/lib/pdf/render";

interface InvoiceSnapshot {
  agency: { name: string; kvkNumber: string | null; vatNumber: string | null; addressLine: string | null; postalCode: string | null; city: string | null; contactEmail: string | null; logo: string | null };
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
  if (!invoice || !(await canOpenBooking(request, invoice.booking))) return new Response("Not found", { status: 404 });

  // The invoice is printed from its snapshot, so later edits to the agency or quote don't change it.
  const snap = invoice.data as unknown as InvoiceSnapshot;
  const buffer = await renderBookingPdf("invoice", pdfLocale(request), {
    agency: { ...snap.agency, brandColor: invoice.organization.brandColor },
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
