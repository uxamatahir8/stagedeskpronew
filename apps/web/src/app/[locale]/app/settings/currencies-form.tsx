"use client";

import { SearchIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { type Currency, currencies, type SettingValue } from "@stagedesk/core";
import { CurrencyFlag, currencyName } from "@/components/currency-flag";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRouter } from "@/i18n/navigation";
import { saveSettingAction } from "./actions";

/**
 * Which currencies agencies and visitors can choose, with the ECB rate next
 * to an optional manual rate. A manual rate wins; currencies the ECB doesn't
 * publish (PKR, AED, SAR) need one before prices can be shown in them.
 */
export function CurrenciesForm({ value, ecb }: { value: SettingValue<"currencies">; ecb: { currency: string; perEur: number; date: string }[] }) {
  const t = useTranslations("currencies");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [enabled, setEnabled] = useState<Currency[]>(value.enabled);
  const [manual, setManual] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(value.manualRates).map(([c, r]) => [c, String(r)])));
  const [q, setQ] = useState("");
  const ecbOf = new Map(ecb.map((r) => [r.currency, r]));
  const number = (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(n);

  const rows = currencies.filter((c) => {
    const needle = q.trim().toLowerCase();
    return !needle || `${c} ${currencyName(c, locale)}`.toLowerCase().includes(needle);
  });

  function save() {
    const manualRates: Partial<Record<Currency, number>> = {};
    for (const [c, raw] of Object.entries(manual)) {
      if (!raw.trim()) continue;
      const n = Number(raw.replace(",", "."));
      if (!(n > 0)) return void toast.error(t("invalidRate", { currency: c }));
      manualRates[c as Currency] = n;
    }
    const missing = enabled.filter((c) => c !== "EUR" && !manualRates[c] && !ecbOf.has(c));
    if (missing.length) return void toast.error(t("needsRate", { list: missing.join(", ") }));
    start(async () => {
      const r = await saveSettingAction("currencies", { enabled: currencies.filter((c) => enabled.includes(c)), manualRates });
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.message);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("hint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} aria-label={t("search")} className="pl-8" />
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("currency")}</TableHead>
                <TableHead className="text-right">{t("ecbRate")}</TableHead>
                <TableHead className="w-36">{t("manualRate")}</TableHead>
                <TableHead className="w-20 text-right">{t("enabled")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => {
                const rate = ecbOf.get(c);
                const on = enabled.includes(c);
                return (
                  <TableRow key={c}>
                    <TableCell>
                      <span className="flex items-center gap-2.5">
                        <CurrencyFlag code={c} className="text-base" />
                        <span className="w-10 font-medium tabular-nums">{c}</span>
                        <span className="text-muted-foreground">{currencyName(c, locale)}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c === "EUR" ? (
                        <span className="text-muted-foreground">{t("base")}</span>
                      ) : rate ? (
                        <span title={rate.date}>{number(rate.perEur)}</span>
                      ) : (
                        <Badge variant="outline">{t("noEcb")}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {c !== "EUR" && (
                        <Input
                          inputMode="decimal"
                          value={manual[c] ?? ""}
                          onChange={(e) => setManual({ ...manual, [c]: e.target.value })}
                          placeholder={rate ? number(rate.perEur) : "—"}
                          aria-label={t("manualRateFor", { currency: c })}
                          className="h-8 tabular-nums"
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Switch
                        checked={on}
                        disabled={c === "EUR"}
                        aria-label={t("enableFor", { currency: c })}
                        onCheckedChange={(next) => setEnabled(next ? [...enabled, c] : enabled.filter((x) => x !== c))}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">{t("rateHint")}</p>
        <div>
          <Button disabled={pending} onClick={save}>
            {t("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
