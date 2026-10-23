import { getFormatter, getTranslations } from "next-intl/server";
import type { VatGroup } from "@stagedesk/core";
import { euro, percent } from "@/lib/format";

export interface QuoteTableData {
  items: { id: string; description: string; quantityHundredths: number; unitPriceCents: number; vatBps: number; subtotalCents: number }[];
  vatGroups: unknown;
  subtotalCents: number;
  totalCents: number;
  depositCents: number;
  depositBps: number;
  notes: string | null;
}

/** Quote lines and totals, as the agency, the customer and the public quote page see them. */
export async function QuoteTable({ quote }: { quote: QuoteTableData }) {
  const [t, format] = await Promise.all([getTranslations("booking"), getFormatter()]);
  const vatGroups = (Array.isArray(quote.vatGroups) ? quote.vatGroups : []) as VatGroup[];

  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto">
        {/* On a phone, unit price and VAT move under the description so nothing scrolls sideways. */}
        <table className="w-full text-sm sm:min-w-[520px]">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2 font-medium">{t("description")}</th>
              <th className="py-2 text-right font-medium">{t("quantity")}</th>
              <th className="hidden py-2 text-right font-medium sm:table-cell">{t("unitPrice")}</th>
              <th className="hidden py-2 text-right font-medium sm:table-cell">{t("vat")}</th>
              <th className="py-2 text-right font-medium">{t("lineTotal")}</th>
            </tr>
          </thead>
          <tbody>
            {quote.items.map((i) => (
              <tr key={i.id} className="border-b last:border-0">
                <td className="py-2">
                  {i.description}
                  <span className="block text-xs text-muted-foreground tabular-nums sm:hidden">
                    {euro(format, i.unitPriceCents)} · {t("vat")} {percent(format, i.vatBps)}
                  </span>
                </td>
                <td className="py-2 text-right tabular-nums">{format.number(i.quantityHundredths / 100)}</td>
                <td className="hidden py-2 text-right tabular-nums sm:table-cell">{euro(format, i.unitPriceCents)}</td>
                <td className="hidden py-2 text-right tabular-nums sm:table-cell">{percent(format, i.vatBps)}</td>
                <td className="py-2 text-right tabular-nums">{euro(format, i.subtotalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="ml-auto grid w-full max-w-72 gap-1 text-sm">
        <div className="flex justify-between">
          <dt>{t("subtotal")}</dt>
          <dd className="tabular-nums">{euro(format, quote.subtotalCents)}</dd>
        </div>
        {vatGroups.map((g) => (
          <div key={g.rateBps} className="flex justify-between text-muted-foreground">
            <dt>{t("vatLine", { rate: percent(format, g.rateBps) })}</dt>
            <dd className="tabular-nums">{euro(format, g.vatCents)}</dd>
          </div>
        ))}
        <div className="flex justify-between border-t pt-1 font-semibold">
          <dt>{t("total")}</dt>
          <dd className="tabular-nums">{euro(format, quote.totalCents)}</dd>
        </div>
        {quote.depositCents > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <dt>{t("depositLine", { pct: percent(format, quote.depositBps) })}</dt>
            <dd className="tabular-nums">{euro(format, quote.depositCents)}</dd>
          </div>
        )}
      </dl>
      {quote.notes && <p className="rounded-lg bg-muted/60 p-3 text-sm whitespace-pre-line">{quote.notes}</p>}
    </div>
  );
}
