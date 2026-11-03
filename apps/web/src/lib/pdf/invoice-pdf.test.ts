import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { computeQuote, parseInvoiceTemplate } from "@stagedesk/core";

vi.mock("server-only", () => ({}));
vi.mock("../auth", () => ({ auth: { api: { getSession: async () => null } } }));
vi.mock("../storage", () => ({
  getPublicFile: async () => ({
    Body: {
      transformToByteArray: async () =>
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAO0lEQVR4nO3RsQ0AMAjEwCf7rxspBUVGMA2db4BHMvVuZ9NZXY8HBvwBMhEyETIRMhEyETIRMhEyUcgH1YYDKdyYG1AAAAAASUVORK5CYII=",
          "base64",
        ),
    },
    ContentType: "image/png",
  }),
}));

/** Real PDFs for raster inspection plus structural and money assertions. */
const out = process.env["PDF_OUT"] ?? join(process.cwd(), "test-results", "pdf");

// Storage is mocked above with a valid pale PNG, keeping the integration test
// self-contained while exercising the production /files/ image-loading path.
const backgroundUrl = "/files/organizations/pdf-fixture/invoice/background.png";
const logoUrl = "/files/organizations/pdf-fixture/logo.png";

beforeAll(() => {
  mkdirSync(out, { recursive: true });
});

function documentInput(lineCount: number, template: unknown, options: { logo?: boolean; long?: boolean } = {}) {
  const lines = Array.from({ length: lineCount }, (_, i) => ({
    description:
      options.long || i === 0
        ? `Regel ${i + 1}: DJ, licht en geluid inclusief opbouw, afbouw, technicus, vervoer en een uitzonderlijk lange omschrijving die voorspelbaar over meerdere regels in de tabel moet doorlopen zonder andere kolommen te bedekken.`
        : `Regel ${i + 1}: lichtset ${i % 3 === 0 ? "met rookmachine" : "basis"}`,
    quantityHundredths: i === 0 ? 550 : 100,
    unitPriceCents: i === 0 ? 12_500 : 1_999 + i,
    vatBps: i % 4 === 3 ? 900 : 2_100,
  }));
  const q = computeQuote(lines, 0);
  return {
    totals: q,
    input: {
      agency: {
        name: "Feestband Utrecht",
        addressLine: "Oudegracht 1",
        postalCode: "3511 AA",
        city: "Utrecht",
        contactEmail: "info@feestband.nl",
        kvkNumber: "12345678",
        vatNumber: "NL001234567B01",
        brandColor: "#5b2a86",
        logo: options.logo ? logoUrl : null,
      },
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
      depositCents: 25_000,
      paidCents: 30_000,
    },
  };
}

const pageCount = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
const baseTemplate = { accentColor: "#d6337f", headerText: "Live muziek en DJ's sinds 2009", footerText: "Op al onze diensten zijn de algemene voorwaarden van toepassing.", backgroundUrl: null, marginTopMm: 32, marginBottomMm: 26, hideLogo: false };

async function renderCase(name: string, kind: "invoice" | "quote", locale: "nl" | "en", lineCount: number, template: unknown = baseTemplate, options: { logo?: boolean; long?: boolean } = {}) {
  const { renderBookingPdf } = await import("./render");
  const { input, totals } = documentInput(lineCount, template, options);
  const pdf = await renderBookingPdf(kind, locale, input);
  writeFileSync(join(out, `${name}.pdf`), pdf);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(totals.subtotalCents + totals.vatCents).toBe(totals.totalCents);
  return pdf;
}

describe("invoice and quote PDF regression matrix", () => {
  it("renders one page", async () => expect(pageCount(await renderCase("invoice-1page", "invoice", "nl", 4))).toBe(1));
  it("renders two pages", async () => expect(pageCount(await renderCase("invoice-2page", "invoice", "nl", 25))).toBe(2));
  it("renders three pages", async () => expect(pageCount(await renderCase("invoice-3page", "invoice", "en", 43))).toBe(3));
  it("renders many line items", async () => expect(pageCount(await renderCase("invoice-many-lines", "invoice", "nl", 80))).toBeGreaterThanOrEqual(4));
  it("renders own paper behind every page", async () => {
    const pdf = await renderCase("invoice-background", "invoice", "nl", 30, { ...baseTemplate, backgroundUrl });
    // The PDF stores one image XObject and reuses it from each page's fixed wrapper.
    expect(pageCount(pdf)).toBeGreaterThan(1);
    expect(pdf.toString("latin1")).toMatch(/\/Subtype\s*\/Image/);
  });
  it("renders the agency logo", async () => expect((await renderCase("invoice-logo", "invoice", "nl", 4, baseTemplate, { logo: true })).toString("latin1")).toMatch(/\/Subtype\s*\/Image/));
  it("renders a custom header and footer", async () => expect(pageCount(await renderCase("invoice-custom-header-footer", "invoice", "nl", 7))).toBe(1));
  it("renders Dutch", async () => expect(pageCount(await renderCase("invoice-dutch", "invoice", "nl", 5))).toBe(1));
  it("renders English", async () => expect(pageCount(await renderCase("invoice-english", "invoice", "en", 5))).toBe(1));
  it("renders a multi-page quote", async () => expect(pageCount(await renderCase("quote-multi-page", "quote", "en", 45))).toBeGreaterThan(1));
  it("renders a historical saved template", async () => expect(pageCount(await renderCase("invoice-historical-template", "invoice", "nl", 15, { ...baseTemplate, accentColor: "#176b52", headerText: "Historische huisstijl 2025" }))).toBeGreaterThanOrEqual(1));
  it("renders long descriptions", async () => expect(pageCount(await renderCase("invoice-long-descriptions", "invoice", "nl", 18, baseTemplate, { long: true }))).toBeGreaterThan(1));
  it("keeps legacy invoices without a template compatible", async () => expect(pageCount(await renderCase("invoice-legacy-defaults", "invoice", "en", 3, null))).toBe(1));
});
