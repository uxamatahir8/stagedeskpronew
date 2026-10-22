"use client";

import { useTranslations } from "next-intl";
import { parseEuros, type FeeRule } from "@stagedesk/core";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { centsToInput } from "@/lib/format";

export interface FeeRuleDraft {
  type: FeeRule["type"];
  percentage: string;
  fixed: string;
  min: string;
  max: string;
}

const types: FeeRule["type"][] = ["none", "percentage", "fixed", "percentage_plus_fixed"];

export function feeRuleToDraft(rule: FeeRule | null, locale: string): FeeRuleDraft {
  return {
    type: rule?.type ?? "percentage",
    percentage: rule ? String(rule.percentageBps / 100).replace(".", locale === "en" ? "." : ",") : "",
    fixed: rule?.fixedCents ? centsToInput(rule.fixedCents, locale) : "",
    min: rule?.minCents != null ? centsToInput(rule.minCents, locale) : "",
    max: rule?.maxCents != null ? centsToInput(rule.maxCents, locale) : "",
  };
}

/** Converts the form draft to a FeeRule, or null if a number doesn't parse. */
export function draftToFeeRule(d: FeeRuleDraft): FeeRule | null {
  const pct = d.percentage.trim() === "" ? 0 : Number(d.percentage.replace(",", "."));
  const fixed = d.fixed.trim() === "" ? 0 : parseEuros(d.fixed);
  const min = d.min.trim() === "" ? null : parseEuros(d.min);
  const max = d.max.trim() === "" ? null : parseEuros(d.max);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100 || fixed === null || fixed < 0) return null;
  if ((d.min.trim() && min === null) || (d.max.trim() && max === null)) return null;
  return { type: d.type, percentageBps: Math.round(pct * 100), fixedCents: fixed, minCents: min, maxCents: max };
}

export function FeeRuleFields({ value, onChange, idPrefix }: { value: FeeRuleDraft; onChange: (d: FeeRuleDraft) => void; idPrefix: string }) {
  const t = useTranslations("fees");
  const set = (patch: Partial<FeeRuleDraft>) => onChange({ ...value, ...patch });
  const showPct = value.type === "percentage" || value.type === "percentage_plus_fixed";
  const showFixed = value.type === "fixed" || value.type === "percentage_plus_fixed";

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField id={`${idPrefix}-type`} label={t("type")} className="sm:col-span-2">
        <Select value={value.type} onValueChange={(v) => set({ type: v as FeeRule["type"] })}>
          <SelectTrigger id={`${idPrefix}-type`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {types.map((ty) => (
              <SelectItem key={ty} value={ty}>
                {t(`type_${ty}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      {showPct && (
        <FormField id={`${idPrefix}-pct`} label={t("percentage")}>
          <Input id={`${idPrefix}-pct`} value={value.percentage} inputMode="decimal" onChange={(e) => set({ percentage: e.target.value })} />
        </FormField>
      )}
      {showFixed && (
        <FormField id={`${idPrefix}-fixed`} label={t("fixed")}>
          <Input id={`${idPrefix}-fixed`} value={value.fixed} inputMode="decimal" onChange={(e) => set({ fixed: e.target.value })} />
        </FormField>
      )}
      {value.type !== "none" && (
        <>
          <FormField id={`${idPrefix}-min`} label={`${t("min")} (${t("optional")})`}>
            <Input id={`${idPrefix}-min`} value={value.min} inputMode="decimal" onChange={(e) => set({ min: e.target.value })} />
          </FormField>
          <FormField id={`${idPrefix}-max`} label={`${t("max")} (${t("optional")})`}>
            <Input id={`${idPrefix}-max`} value={value.max} inputMode="decimal" onChange={(e) => set({ max: e.target.value })} />
          </FormField>
        </>
      )}
    </div>
  );
}
