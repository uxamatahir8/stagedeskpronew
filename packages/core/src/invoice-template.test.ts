import { describe, expect, it } from "vitest";
import { defaultInvoiceTemplate, invoiceTemplateSchema, mmToPt, parseInvoiceTemplate, templateBackgroundAllowed } from "./invoice-template";

describe("invoice template", () => {
  it("has safe defaults and reads old or broken values as the defaults", () => {
    expect(parseInvoiceTemplate(null)).toEqual(defaultInvoiceTemplate);
    expect(parseInvoiceTemplate({ accentColor: "red" })).toEqual(defaultInvoiceTemplate);
    expect(defaultInvoiceTemplate).toMatchObject({ accentColor: null, backgroundUrl: null, showPaymentDetails: true, marginTopMm: 17 });
  });

  it("accepts the agency's own uploaded background only", () => {
    const ok = invoiceTemplateSchema.safeParse({ backgroundUrl: "/files/organizations/org-1/invoice/bg-1.png" });
    expect(ok.success).toBe(true);
    for (const bad of ["https://evil.example/bg.png", "/files/../secrets", "/files/organizations/org-1/../org-2/x.png", "javascript:alert(1)", "file:///etc/passwd"]) {
      expect(invoiceTemplateSchema.safeParse({ backgroundUrl: bad }).success).toBe(false);
    }
    expect(templateBackgroundAllowed("/files/organizations/org-1/invoice/bg.png", "org-1")).toBe(true);
    expect(templateBackgroundAllowed("/files/organizations/org-2/invoice/bg.png", "org-1")).toBe(false);
  });

  it("keeps margins within printable bounds", () => {
    expect(invoiceTemplateSchema.safeParse({ marginTopMm: 5 }).success).toBe(false);
    expect(invoiceTemplateSchema.safeParse({ marginTopMm: 120 }).success).toBe(false);
    expect(mmToPt(25.4)).toBe(72);
  });
});
