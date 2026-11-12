import { z } from "zod";

/**
 * How an agency's invoices and quotes look. Only data, never markup: colours
 * are hex codes, texts are plain, and the background is one of the agency's
 * own uploaded files (/files/…), drawn behind the page. The margins keep the
 * figures clear of a letterhead's printed header and footer.
 */
export const invoiceTemplateSchema = z.object({
  /** Title and table accent; null follows the agency's brand colour. */
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .default(null),
  /** A line under the agency's details, e.g. a slogan or extra address. */
  headerText: z.string().trim().max(300).nullable().default(null),
  /** Printed at the bottom of every page, e.g. terms or a registration line. */
  footerText: z.string().trim().max(600).nullable().default(null),
  /** Full-page background image (letterhead), PNG or JPEG, an uploaded /files/ path. */
  backgroundUrl: z
    .string()
    .max(500)
    .regex(/^\/files\/organizations\/[\w-]+\/[\w./-]+$/)
    .refine((v) => !v.includes(".."), "path")
    .nullable()
    .default(null),
  /** Space kept free at the top and bottom of the page, in millimetres. */
  marginTopMm: z.number().int().min(10).max(90).default(17),
  marginBottomMm: z.number().int().min(10).max(60).default(20),
  /** Bank details and payment instructions on invoices. */
  showPaymentDetails: z.boolean().default(true),
  /** Hide the logo (when the background already carries it). */
  hideLogo: z.boolean().default(false),
});
export type InvoiceTemplate = z.infer<typeof invoiceTemplateSchema>;

export const defaultInvoiceTemplate: InvoiceTemplate = invoiceTemplateSchema.parse({});

/** Reads a stored template (or an issued invoice's snapshot); anything malformed falls back to the defaults. */
export function parseInvoiceTemplate(value: unknown): InvoiceTemplate {
  const parsed = invoiceTemplateSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : defaultInvoiceTemplate;
}

/** A background must belong to the agency whose invoice it's on. */
export function templateBackgroundAllowed(url: string | null, organizationId: string) {
  return url === null || url.startsWith(`/files/organizations/${organizationId}/`);
}

/** Millimetres to PDF points. */
export const mmToPt = (mm: number) => Math.round((mm * 72) / 25.4);
