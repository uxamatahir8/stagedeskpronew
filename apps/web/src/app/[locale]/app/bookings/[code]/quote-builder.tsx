"use client";

import { PlusIcon, SendIcon, Trash2Icon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { computeQuote, parseEuros, parseQuantity } from "@stagedesk/core";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { centsToInput, euro, percent } from "@/lib/format";
import { sendQuoteAction } from "../actions";

export interface BuilderLine {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
  vatBps: number;
}

export interface CatalogItem {
  id: string;
  name: string;
  unit: string;
  unitPriceCents: number;
  vatBps: number;
}

let nextKey = 0;
const key = () => `line-${nextKey++}`;

export function QuoteBuilder({
  bookingId,
  catalog,
  vatRates,
  initialLines,
  defaultDepositBps,
  defaultExpiryDays,
  onDone,
}: {
  bookingId: string;
  catalog: CatalogItem[];
  vatRates: number[];
  initialLines: Omit<BuilderLine, "key">[];
  defaultDepositBps: number;
  defaultExpiryDays: number;
  onDone: () => void;
}) {
  const t = useTranslations("booking");
  const tu = useTranslations("ui");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lines, setLines] = useState<BuilderLine[]>(() =>
    initialLines.length ? initialLines.map((l) => ({ ...l, key: key() })) : [{ key: key(), description: "", quantity: "1", unitPrice: "", vatBps: vatRates[0] ?? 2_100 }],
  );
  const [depositPct, setDepositPct] = useState(String(defaultDepositBps / 100));
  const [days, setDays] = useState(String(defaultExpiryDays));
  const [notes, setNotes] = useState("");

  // Live totals with the same maths the server uses; incomplete lines are left out.
  const totals = useMemo(() => {
    const valid = lines.flatMap((l) => {
      const q = parseQuantity(l.quantity);
      const p = parseEuros(l.unitPrice);
      return q !== null && p !== null ? [{ description: l.description, quantityHundredths: q, unitPriceCents: p, vatBps: l.vatBps }] : [];
    });
    const deposit = Math.min(100, Math.max(0, Number(depositPct.replace(",", ".")) || 0));
    return computeQuote(valid, Math.round(deposit * 100));
  }, [lines, depositPct]);

  const update = (k: string, patch: Partial<BuilderLine>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const lineTotal = (l: BuilderLine) => {
    const q = parseQuantity(l.quantity);
    const p = parseEuros(l.unitPrice);
    return q !== null && p !== null ? euro(format, Math.round((q * p) / 100)) : "—";
  };

  function addFromCatalog(item: CatalogItem) {
    setLines((ls) => [
      ...ls.filter((l) => l.description || l.unitPrice),
      { key: key(), description: item.name, quantity: "1", unitPrice: centsToInput(item.unitPriceCents, locale), vatBps: item.vatBps },
    ]);
  }

  function submit() {
    startTransition(async () => {
      const result = await sendQuoteAction(bookingId, {
        depositPct: Math.min(100, Math.max(0, Number(depositPct.replace(",", ".")) || 0)),
        expiresInDays: Math.max(1, Math.min(180, Number(days) || 14)),
        notes: notes || null,
        lines: lines.map(({ description, quantity, unitPrice, vatBps }) => ({ description, quantity, unitPrice, vatBps })),
      });
      if (!result.ok) return void toast.error(result.message);
      toast.success(result.message);
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-2 font-medium">{t("description")}</th>
              <th className="w-20 pb-2 font-medium">{t("quantity")}</th>
              <th className="w-32 pb-2 font-medium">{t("unitPrice")}</th>
              <th className="w-24 pb-2 font-medium">{t("vat")}</th>
              <th className="w-28 pb-2 text-right font-medium">{t("lineTotal")}</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.key} className="align-top">
                <td className="py-1 pr-2">
                  <Input aria-label={`${t("description")} ${i + 1}`} value={l.description} maxLength={500} onChange={(e) => update(l.key, { description: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <Input aria-label={`${t("quantity")} ${i + 1}`} value={l.quantity} inputMode="decimal" onChange={(e) => update(l.key, { quantity: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <Input aria-label={`${t("unitPrice")} ${i + 1}`} value={l.unitPrice} inputMode="decimal" placeholder="0,00" onChange={(e) => update(l.key, { unitPrice: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <Select value={String(l.vatBps)} onValueChange={(v) => update(l.key, { vatBps: Number(v) })}>
                    <SelectTrigger aria-label={`${t("vat")} ${i + 1}`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {vatRates.map((r) => (
                        <SelectItem key={r} value={String(r)}>
                          {percent(format, r)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td className="py-2 text-right tabular-nums">{lineTotal(l)}</td>
                <td className="py-1 pl-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("removeLine")}
                    disabled={lines.length === 1}
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                  >
                    <Trash2Icon />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLines((ls) => [...ls, { key: key(), description: "", quantity: "1", unitPrice: "", vatBps: vatRates[0] ?? 2_100 }])}
        >
          <PlusIcon />
          {t("addLine")}
        </Button>
        {catalog.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <PlusIcon />
                {t("addFromCatalog")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {catalog.map((item) => (
                <DropdownMenuItem key={item.id} onSelect={() => addFromCatalog(item)}>
                  <span className="flex-1">{item.name}</span>
                  <span className="text-muted-foreground tabular-nums">{euro(format, item.unitPriceCents)}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_18rem]">
        <div className="grid content-start gap-4 sm:grid-cols-2">
          <FormField id="q-deposit" label={t("deposit")}>
            <Input id="q-deposit" value={depositPct} inputMode="decimal" onChange={(e) => setDepositPct(e.target.value)} />
          </FormField>
          <FormField id="q-days" label={t("validDays")}>
            <Input id="q-days" value={days} inputMode="numeric" onChange={(e) => setDays(e.target.value)} />
          </FormField>
          <FormField id="q-notes" label={t("notes")} className="sm:col-span-2">
            <Textarea id="q-notes" value={notes} rows={3} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
        </div>
        <dl className="grid content-start gap-2 rounded-xl bg-muted/60 p-4 text-sm">
          <div className="flex justify-between">
            <dt>{t("subtotal")}</dt>
            <dd className="tabular-nums">{euro(format, totals.subtotalCents)}</dd>
          </div>
          {totals.vatGroups.map((g) => (
            <div key={g.rateBps} className="flex justify-between text-muted-foreground">
              <dt>{t("vatLine", { rate: percent(format, g.rateBps) })}</dt>
              <dd className="tabular-nums">{euro(format, g.vatCents)}</dd>
            </div>
          ))}
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <dt>{t("total")}</dt>
            <dd className="tabular-nums">{euro(format, totals.totalCents)}</dd>
          </div>
          {totals.depositCents > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <dt>{t("depositLine", { pct: depositPct.replace(".", ",") + "%" })}</dt>
              <dd className="tabular-nums">{euro(format, totals.depositCents)}</dd>
            </div>
          )}
        </dl>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          {tu("secondary")}
        </Button>
        <Button onClick={submit} disabled={pending || totals.lines.length === 0}>
          <SendIcon />
          {t("send")}
        </Button>
      </div>
    </div>
  );
}
