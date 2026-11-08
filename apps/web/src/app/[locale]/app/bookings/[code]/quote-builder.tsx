"use client";

import { PlusIcon, SendIcon, Trash2Icon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useFormatter } from "@/components/date-prefs";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { computeQuote, type DepositRule, type DepositType, parseEuros, parseQuantity, quoteAmountProblem } from "@stagedesk/core";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { centsToInput, euro, percent } from "@/lib/format";
import type { ActionResult } from "@/lib/actions";
import type { QuoteDraft } from "@/lib/quote-input";
import { sendQuoteAction } from "../actions";

export interface BuilderLine {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
  vatBps: number;
}

/** Where a booking quote starts: the agency's default upfront payment, and the language the customer will get. */
export interface QuoteDefaults {
  depositType: DepositType;
  /** Fixed upfront amount as an input value ("250,00"). */
  depositFixed: string;
  locale: "nl" | "en";
  /** "customer": their own language; "agency": the agency's language, as the customer never chose one. */
  localeReason: "customer" | "agency";
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
  currency,
  onDone,
  submit: submitDraft,
  submitLabel,
  defaults,
}: {
  /** Sends a quote on this booking; or pass `submit` to send the draft elsewhere (a price for a lead). */
  bookingId?: string;
  submit?: (input: QuoteDraft) => Promise<ActionResult>;
  submitLabel?: string;
  catalog: CatalogItem[];
  vatRates: number[];
  initialLines: Omit<BuilderLine, "key">[];
  defaultDepositBps: number;
  defaultExpiryDays: number;
  currency: string;
  onDone: () => void;
  /** Booking quotes only: upfront payment kinds and the email language (lead prices are percentages only). */
  defaults?: QuoteDefaults;
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
  const [depositType, setDepositType] = useState<DepositType>(defaults?.depositType ?? "percentage");
  const [depositFixed, setDepositFixed] = useState(defaults?.depositFixed ?? "");
  const [mailLocale, setMailLocale] = useState<"nl" | "en">(defaults?.locale ?? (locale === "en" ? "en" : "nl"));
  const [days, setDays] = useState(String(defaultExpiryDays));
  const [notes, setNotes] = useState("");

  // Live totals with the same maths the server uses; incomplete lines are left out.
  const totals = useMemo(() => {
    const valid = lines.flatMap((l) => {
      const q = parseQuantity(l.quantity);
      const p = parseEuros(l.unitPrice);
      return q !== null && p !== null ? [{ description: l.description, quantityHundredths: q, unitPriceCents: p, vatBps: l.vatBps }] : [];
    });
    const pct = Math.min(100, Math.max(0, Number(depositPct.replace(",", ".")) || 0));
    const fixed = parseEuros(depositFixed);
    const rule: DepositRule =
      depositType === "none" ? { type: "none" } : depositType === "fixed" ? { type: "fixed", cents: fixed !== null && fixed > 0 ? fixed : 0 } : { type: "percentage", bps: Math.round(pct * 100) };
    return computeQuote(valid, rule);
  }, [lines, depositPct, depositType, depositFixed]);
  const fixedInvalid = depositType === "fixed" && (parseEuros(depositFixed) === null || (parseEuros(depositFixed) ?? 0) < 0);

  // Why it can't be sent yet, said out loud instead of a greyed-out button or a silently changed value.
  const pctValue = Number(depositPct.replace(",", "."));
  const pctInvalid = depositType === "percentage" && (depositPct.trim() === "" || !Number.isFinite(pctValue) || pctValue < 0 || pctValue > 100);
  const daysValue = Number(days);
  const daysInvalid = !Number.isInteger(daysValue) || daysValue < 1 || daysValue > 180;
  const badLine = lines.findIndex((l) => (l.description || l.unitPrice) && (parseQuantity(l.quantity) === null || parseEuros(l.unitPrice) === null));
  const amountProblem = quoteAmountProblem(totals);
  const blocked =
    badLine >= 0
      ? t("invalidLine", { n: badLine + 1 })
      : totals.lines.length === 0
        ? t("needsLine")
        : amountProblem === "negative_total"
          ? t("totalNegative")
          : amountProblem === "amount_too_high"
            ? t("totalTooHigh")
            : null;

  const update = (k: string, patch: Partial<BuilderLine>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));
  const lineTotal = (l: BuilderLine) => {
    const q = parseQuantity(l.quantity);
    const p = parseEuros(l.unitPrice);
    return q !== null && p !== null ? euro(format, Math.round((q * p) / 100), currency) : "—";
  };

  function addFromCatalog(item: CatalogItem) {
    setLines((ls) => [
      ...ls.filter((l) => l.description || l.unitPrice),
      { key: key(), description: item.name, quantity: "1", unitPrice: centsToInput(item.unitPriceCents, locale), vatBps: item.vatBps },
    ]);
  }

  function submit() {
    startTransition(async () => {
      const draft: QuoteDraft = {
        ...(defaults ? { depositType, depositFixed, locale: mailLocale } : {}),
        depositPct: Math.min(100, Math.max(0, Number(depositPct.replace(",", ".")) || 0)),
        expiresInDays: daysValue,
        notes: notes || null,
        lines: lines.map(({ description, quantity, unitPrice, vatBps }) => ({ description, quantity, unitPrice, vatBps })),
      };
      const result = submitDraft ? await submitDraft(draft) : await sendQuoteAction(bookingId!, draft);
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
                  <span className="text-muted-foreground tabular-nums">{euro(format, item.unitPriceCents, currency)}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_18rem]">
        <div className="grid content-start gap-4 sm:grid-cols-2">
          {defaults && (
            <FormField id="q-deposit-type" label={t("depositType")} hint={t(`depositType_${depositType}Hint`)}>
              <NativeSelect id="q-deposit-type" value={depositType} onChange={(e) => setDepositType(e.target.value as DepositType)} className="w-full">
                {(["none", "percentage", "fixed"] as const).map((k) => (
                  <option key={k} value={k}>
                    {t(`depositType_${k}`)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          )}
          {depositType === "percentage" && (
            <FormField required id="q-deposit" label={t("deposit")} error={pctInvalid ? t("depositPctInvalid") : undefined}>
              <Input required id="q-deposit" value={depositPct} inputMode="decimal" onChange={(e) => setDepositPct(e.target.value)} aria-invalid={pctInvalid || undefined} />
            </FormField>
          )}
          {depositType === "fixed" && (
            <FormField required id="q-deposit-fixed" label={t("depositFixed")} error={fixedInvalid ? t("depositFixedInvalid") : undefined}>
              <Input required id="q-deposit-fixed" value={depositFixed} inputMode="decimal" placeholder="0,00" onChange={(e) => setDepositFixed(e.target.value)} aria-invalid={fixedInvalid || undefined} />
            </FormField>
          )}
          {defaults && (
            <FormField id="q-locale" label={t("mailLanguage")} hint={mailLocale === defaults.locale ? t(`mailLanguage_${defaults.localeReason}`) : t("mailLanguage_chosen")}>
              <NativeSelect id="q-locale" value={mailLocale} onChange={(e) => setMailLocale(e.target.value as "nl" | "en")} className="w-full">
                <option value="nl">Nederlands</option>
                <option value="en">English</option>
              </NativeSelect>
            </FormField>
          )}
          <FormField required id="q-days" label={t("validDays")} error={daysInvalid ? t("validDaysInvalid") : undefined}>
            <Input required id="q-days" value={days} inputMode="numeric" onChange={(e) => setDays(e.target.value)} aria-invalid={daysInvalid || undefined} />
          </FormField>
          <FormField id="q-notes" label={t("notes")} className="sm:col-span-2">
            <Textarea id="q-notes" value={notes} rows={3} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
        </div>
        <dl className="grid content-start gap-2 rounded-xl bg-muted/60 p-4 text-sm">
          <div className="flex justify-between">
            <dt>{t("subtotal")}</dt>
            <dd className="tabular-nums">{euro(format, totals.subtotalCents, currency)}</dd>
          </div>
          {totals.vatGroups.map((g) => (
            <div key={g.rateBps} className="flex justify-between text-muted-foreground">
              <dt>{t("vatLine", { rate: percent(format, g.rateBps) })}</dt>
              <dd className="tabular-nums">{euro(format, g.vatCents, currency)}</dd>
            </div>
          ))}
          <div className="flex justify-between border-t pt-2 text-base font-semibold">
            <dt>{t("total")}</dt>
            <dd className="tabular-nums">{euro(format, totals.totalCents, currency)}</dd>
          </div>
          {totals.depositCents > 0 ? (
            <>
              <div className="flex justify-between text-muted-foreground">
                <dt>{depositType === "fixed" ? t("depositFixedLine") : t("depositLine", { pct: depositPct.replace(".", ",") + "%" })}</dt>
                <dd className="tabular-nums">{euro(format, totals.depositCents, currency)}</dd>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <dt>{t("balanceLine")}</dt>
                <dd className="tabular-nums">{euro(format, totals.balanceCents, currency)}</dd>
              </div>
            </>
          ) : (
            totals.totalCents > 0 && <p className="text-muted-foreground">{t("noDepositLine")}</p>
          )}
          {defaults && <p className="border-t pt-2 text-xs text-muted-foreground">{t("mailLanguageSummary", { language: mailLocale === "nl" ? "Nederlands" : "English" })}</p>}
        </dl>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {blocked && (
          <p role="status" className="mr-auto text-sm text-muted-foreground">
            {blocked}
          </p>
        )}
        <Button variant="ghost" onClick={onDone}>
          {tu("secondary")}
        </Button>
        <Button onClick={submit} disabled={pending || blocked !== null || fixedInvalid || pctInvalid || daysInvalid}>
          <SendIcon />
          {submitLabel ?? t("send")}
        </Button>
      </div>
    </div>
  );
}
