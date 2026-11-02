import { parseInvoiceTemplate, templateBackgroundAllowed } from "@stagedesk/core";
import { prisma } from "@stagedesk/db";
import { auth } from "@/lib/auth";
import { canOpenBooking, pdfLocale, pdfResponse, renderBookingPdf } from "@/lib/pdf/render";

/**
 * A sample invoice in the agency's current look, for the settings page. Only
 * for the agency's desk (or support); it uses made-up lines and no customer data.
 */
export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  const organizationId = new URL(request.url).searchParams.get("agency") ?? "";
  if (!session || !organizationId || !(await canOpenBooking(request, { organizationId, customerId: null }))) return new Response("Not found", { status: 404 });
  const a = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!a) return new Response("Not found", { status: 404 });
  const template = parseInvoiceTemplate(a.invoiceTemplate);
  if (!templateBackgroundAllowed(template.backgroundUrl, a.id)) template.backgroundUrl = null;
  const locale = pdfLocale(request);
  const now = new Date();
  const buffer = await renderBookingPdf("invoice", locale, {
    agency: { name: a.name, addressLine: a.addressLine, postalCode: a.postalCode, city: a.city, contactEmail: a.contactEmail, kvkNumber: a.kvkNumber, vatNumber: a.vatNumber, brandColor: a.brandColor, logo: a.logo },
    template,
    payment: { iban: a.iban, accountName: a.bankAccountName, instructions: a.paymentInstructions },
    currency: a.currency,
    customer: { name: locale === "en" ? "Sample customer" : "Voorbeeldklant", email: "klant@example.com" },
    number: locale === "en" ? "SAMPLE" : "VOORBEELD",
    issued: now,
    due: new Date(now.getTime() + 14 * 86_400_000),
    reference: "K7Q2M9XA",
    eventDate: null,
    lines: [
      { description: locale === "en" ? "DJ, per hour" : "DJ, per uur", quantityHundredths: 500, unitPriceCents: 15_000, vatBps: 2_100, subtotalCents: 75_000 },
      { description: locale === "en" ? "Lights and sound" : "Licht en geluid", quantityHundredths: 100, unitPriceCents: 14_500, vatBps: 2_100, subtotalCents: 14_500 },
    ],
    vatGroups: [{ rateBps: 2_100, baseCents: 89_500, vatCents: 18_795 }],
    subtotalCents: 89_500,
    totalCents: 108_295,
    paidCents: 32_489,
  });
  return pdfResponse(buffer, "invoice-preview.pdf");
}
