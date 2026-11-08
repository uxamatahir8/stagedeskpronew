import { type CreditVatGroup, parseInvoiceTemplate, templateBackgroundAllowed } from "@stagedesk/core";
import { prisma } from "@stagedesk/db";
import { createTranslator } from "next-intl";
import en from "../../../../../../messages/en.json";
import nl from "../../../../../../messages/nl.json";
import { canOpenBooking, pdfLocale, pdfResponse, quoteLinkOpens, renderBookingPdf } from "@/lib/pdf/render";

interface InvoiceSnapshot {
  agency: { name: string; kvkNumber: string | null; vatNumber: string | null; addressLine: string | null; postalCode: string | null; city: string | null; contactEmail: string | null; logo: string | null };
  template?: unknown;
  locale?: string | null;
  customer: { name: string; email: string } | null;
  trackingCode: string;
  eventDate: string | null;
}

/** Printed from the invoice's snapshot, like the invoice itself; amounts are negative because they correct it. */
export async function GET(request: Request, { params }: RouteContext<"/api/pdf/credit-note/[id]">) {
  const { id } = await params;
  const note = await prisma.creditNote.findUnique({
    where: { id },
    include: {
      invoice: { select: { number: true, data: true } },
      booking: { select: { organizationId: true, customerId: true, currency: true } },
      organization: { select: { brandColor: true } },
    },
  });
  if (!note || !((await quoteLinkOpens(request, note.bookingId)) || (await canOpenBooking(request, note.booking)))) return new Response("Not found", { status: 404 });

  const snap = note.invoice.data as unknown as InvoiceSnapshot;
  const template = parseInvoiceTemplate(snap.template);
  if (!templateBackgroundAllowed(template.backgroundUrl, note.organizationId)) template.backgroundUrl = null;
  const lang = new URL(request.url).searchParams.has("lang") ? pdfLocale(request) : snap.locale === "en" ? "en" : "nl";
  const t = createTranslator({ locale: lang, messages: lang === "en" ? en : nl });
  const groups = note.vatGroups as unknown as CreditVatGroup[];
  const buffer = await renderBookingPdf("credit_note", lang, {
    agency: { ...snap.agency, brandColor: note.organization.brandColor },
    template,
    currency: note.booking.currency,
    customer: snap.customer,
    number: note.number,
    invoiceNumber: note.invoice.number,
    issued: note.issuedAt,
    due: null,
    reference: snap.trackingCode,
    eventDate: snap.eventDate,
    lines: groups.map((g) => ({
      description: t("pdf.creditLine", { number: note.invoice.number }),
      quantityHundredths: 100,
      unitPriceCents: -g.baseCents,
      vatBps: g.rateBps,
      subtotalCents: -g.baseCents,
    })),
    vatGroups: groups.map((g) => ({ rateBps: g.rateBps, baseCents: -g.baseCents, vatCents: -g.vatCents })),
    subtotalCents: -note.subtotalCents,
    totalCents: -note.totalCents,
  });
  return pdfResponse(buffer, `creditnota-${note.number}.pdf`);
}
