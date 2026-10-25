import { z } from "zod";
import { parseEuros, parseQuantity, type QuoteLineInput } from "@stagedesk/core";

/** What the quote builder sends: amounts as typed ("1.250,00"), parsed on the server. */
export const quoteDraftSchema = z.object({
  depositPct: z.number().min(0).max(100),
  expiresInDays: z.number().int().min(1).max(180),
  notes: z.string().max(2000).nullable(),
  lines: z
    .array(z.object({ description: z.string(), quantity: z.string(), unitPrice: z.string(), vatBps: z.number().int() }))
    .max(50),
});

export type QuoteDraft = z.input<typeof quoteDraftSchema>;

/** Parses the typed lines; returns the 1-based number of the first bad line instead when one doesn't parse. */
export function parseQuoteLines(lines: QuoteDraft["lines"], vatRatesBps: number[]): { lines: QuoteLineInput[] } | { badLine: number } {
  const out: QuoteLineInput[] = [];
  for (const [i, line] of lines.entries()) {
    const quantityHundredths = parseQuantity(line.quantity);
    const unitPriceCents = parseEuros(line.unitPrice);
    if (!line.description.trim() || line.description.length > 500 || quantityHundredths === null || unitPriceCents === null || !vatRatesBps.includes(line.vatBps)) {
      return { badLine: i + 1 };
    }
    out.push({ description: line.description.trim(), quantityHundredths, unitPriceCents, vatBps: line.vatBps });
  }
  return { lines: out };
}
