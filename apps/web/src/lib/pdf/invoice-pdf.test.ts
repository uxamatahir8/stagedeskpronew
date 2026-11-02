import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { computeQuote, parseInvoiceTemplate } from "@stagedesk/core";

vi.mock("server-only", () => ({}));
// The PDF module imports the auth config only for canOpenBooking; rendering doesn't need it.
vi.mock("../auth", () => ({ auth: { api: { getSession: async () => null } } }));

/**
 * Renders real invoices through the app's PDF pipeline with an uploaded
 * background (own paper), branding and bank details, on one page and on
 * several. The files are written to PDF_OUT for a person (or a rasteriser)
 * to look at; the assertions here check structure and figures.
 */
const out = process.env["PDF_OUT"] ?? join(process.cwd(), "test-results", "pdf");
const org = `pdf${Date.now().toString(36)}`;
let backgroundUrl = "";

beforeAll(async () => {
  mkdirSync(out, { recursive: true });
  const { putPublicFile } = await import("../storage");
  const png = readFileSync(process.env["LETTERHEAD"] ?? join(__dirname, "../../../e2e/fixtures/letterhead.png"));
  backgroundUrl = await putPublicFile(`organizations/${org}/invoice/background-test.png`, new Uint8Array(png), "image/png");
});

afterAll(async () => {
  const { deletePublicFile } = await import("../storage");
  await deletePublicFile(backgroundUrl);
});

function invoiceInput(lineCount: number, template: unknown) {
  const lines = Array.from({ length: lineCount }, (_, i) => ({
    description: i === 0 ? "DJ, per uur (incl. opbouw en afbouw, met een lange omschrijving die over twee regels loopt in de tabel)" : `Regel ${i + 1}: lichtset ${i % 3 === 0 ? "met rookmachine" : "basis"}`,
    quantityHundredths: i === 0 ? 550 : 100,
    unitPriceCents: i === 0 ? 12_500 : 1_999 + i,
    vatBps: i % 4 === 3 ? 900 : 2_100,
  }));
  const q = computeQuote(lines, 0);
  return {
    totals: q,
    input: {
      agency: { name: "Feestband Utrecht", addressLine: "Oudegracht 1", postalCode: "3511 AA", city: "Utrecht", contactEmail: "info@feestband.nl", kvkNumber: "12345678", vatNumber: "NL001234567B01", brandColor: "#5b2a86", logo: null },
      template: parseInvoiceTemplate(template),
      payment: { iban: "NL91ABNA0417164300", accountName: "Feestband Utrecht B.V.", instructions: "Graag binnen 14 dagen betalen onder vermelding van het factuurnummer." },
      currency: "EUR",
      customer: { name: "Sanne de Vries", email: "sanne@example.com" },
      number: "FB-2027-0042",
      issued: new Date("2027-06-14T10:00:00Z"),
      due: new Date("2027-06-28T10:00:00Z"),
      reference: "K7Q2M9XA",
      eventDate: "2027-06-12",
      lines: q.lines,
      vatGroups: q.vatGroups,
      subtotalCents: q.subtotalCents,
      totalCents: q.totalCents,
      paidCents: 30_000,
    },
  };
}

const pageCount = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;

describe("invoice PDF with own paper", () => {
  const template = { accentColor: "#d6337f", headerText: "Live muziek en DJ's sinds 2009", footerText: "Op al onze diensten zijn de algemene voorwaarden van toepassing.", backgroundUrl: "", marginTopMm: 32, marginBottomMm: 26, hideLogo: true };

  it("renders one page with the background, branding and bank details", async () => {
    const { renderBookingPdf } = await import("./render");
    const { input, totals } = invoiceInput(4, { ...template, backgroundUrl });
    const pdf = await renderBookingPdf("invoice", "nl", input);
    writeFileSync(join(out, "invoice-1page.pdf"), pdf);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pageCount(pdf)).toBe(1);
    // The background image is embedded (an image XObject), not just referenced.
    expect(pdf.toString("latin1")).toMatch(/\/Subtype\s*\/Image/);
    expect(totals.totalCents).toBe(totals.subtotalCents + totals.vatCents);
  });

  it("renders a long invoice over several pages, with the background on each", async () => {
    const { renderBookingPdf } = await import("./render");
    const { input } = invoiceInput(60, { ...template, backgroundUrl });
    const pdf = await renderBookingPdf("invoice", "nl", input);
    writeFileSync(join(out, "invoice-multipage.pdf"), pdf);
    expect(pageCount(pdf)).toBeGreaterThan(1);
  });

  it("renders an old invoice (no template in its snapshot) with the defaults", async () => {
    const { renderBookingPdf } = await import("./render");
    const { input } = invoiceInput(3, null);
    const pdf = await renderBookingPdf("invoice", "en", input);
    writeFileSync(join(out, "invoice-legacy.pdf"), pdf);
    expect(pageCount(pdf)).toBe(1);
    expect(pdf.toString("latin1")).not.toMatch(/\/Subtype\s*\/Image/);
  });

  it("ignores a background of another agency", async () => {
    const { renderBookingPdf } = await import("./render");
    const { templateBackgroundAllowed } = await import("@stagedesk/core");
    expect(templateBackgroundAllowed(backgroundUrl, "someone-else")).toBe(false);
    const { input } = invoiceInput(2, { ...template, backgroundUrl });
    // As the invoice route does: refuse a path outside the invoice's agency.
    if (!templateBackgroundAllowed(input.template.backgroundUrl, "someone-else")) input.template.backgroundUrl = null;
    const pdf = await renderBookingPdf("invoice", "nl", input);
    expect(pdf.toString("latin1")).not.toMatch(/\/Subtype\s*\/Image/);
  });
});
