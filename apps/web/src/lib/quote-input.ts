import { z } from "zod";
import { type DepositRule, depositTypes, parseEuros, parseQuantity, type QuoteLineInput } from "@stagedesk/core";

/** What the quote builder sends: amounts as typed ("1.250,00"), parsed on the server. */
export const quoteDraftSchema = z.object({
  /** Missing on drafts from callers that only know percentages (lead offers). */
  depositType: z.enum(depositTypes).optional(),
  depositPct: z.number().min(0).max(100),
  /** A fixed upfront amount as typed, for depositType "fixed". */
  depositFixed: z.string().max(32).optional(),
  /** Language the customer gets the quote in. */
  locale: z.enum(["nl", "en"]).optional(),
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

/** The upfront payment a draft asks for; null when a fixed amount doesn't parse. */
export function draftDeposit(draft: Pick<z.output<typeof quoteDraftSchema>, "depositType" | "depositPct" | "depositFixed">): DepositRule | null {
  if (draft.depositType === "none") return { type: "none" };
  if (draft.depositType === "fixed") {
    const cents = parseEuros(draft.depositFixed ?? "");
    return cents === null || cents < 0 ? null : { type: "fixed", cents };
  }
  return { type: "percentage", bps: Math.round(draft.depositPct * 100) };
}
