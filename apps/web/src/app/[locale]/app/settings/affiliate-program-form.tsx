"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { parseEuros, type SettingValue } from "@stagedesk/core";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "@/i18n/navigation";
import { centsToInput } from "@/lib/format";
import { saveSettingAction } from "./actions";

type Program = SettingValue<"affiliates.program">;

const pct = (bps: number, locale: string) => String(bps / 100).replace(".", locale === "en" ? "." : ",");
const toBps = (s: string) => {
  const n = Number(s.trim().replace(",", "."));
  return s.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) : null;
};
const int = (s: string, min = 0) => (/^\d+$/.test(s.trim()) && Number(s) >= min ? Number(s) : null);

/** Affiliate program rules and the tier table. Changes apply to new referrals only. */
export function AffiliateProgramForm({ program }: { program: Program }) {
  const t = useTranslations("programSettings");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(program.enabled);
  const [manual, setManual] = useState(program.manualApproval);
  const [payoutMode, setPayoutMode] = useState(program.payoutMode);
  const [methods, setMethods] = useState(program.payoutMethods);
  const [f, setF] = useState({
    rate: pct(program.commissionBps, locale),
    months: program.commissionMonths === null ? "" : String(program.commissionMonths),
    cookie: String(program.cookieDays),
    approval: String(program.approvalDays),
    minPayout: centsToInput(program.minPayoutCents, locale),
    payoutDay: String(program.payoutDayOfMonth),
    discount: pct(program.promoDiscountBps, locale),
    discountMonths: String(program.promoDiscountMonths),
    freeMonths: String(program.agencyReferralFreeMonths),
    review: centsToInput(program.reviewThresholdCents, locale),
  });
  const [tiers, setTiers] = useState(program.tiers.map((tier) => ({ ...tier, rate: pct(tier.commissionBps, locale), min: String(tier.minPayingAgencies) })));

  const field = (key: keyof typeof f, label: string, hint?: string) => (
    <FormField id={`prog-${key}`} label={label} hint={hint}>
      <Input id={`prog-${key}`} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} />
    </FormField>
  );

  function save() {
    const parsedTiers = tiers.map((tier) => ({ name: tier.name.trim(), minPayingAgencies: int(tier.min), commissionBps: toBps(tier.rate), perks: tier.perks.trim() }));
    const value = {
      enabled,
      manualApproval: manual,
      commissionBps: toBps(f.rate),
      commissionMonths: f.months.trim() === "" ? null : int(f.months, 1),
      cookieDays: int(f.cookie, 1),
      approvalDays: int(f.approval),
      minPayoutCents: parseEuros(f.minPayout || "0"),
      payoutDayOfMonth: int(f.payoutDay, 1),
      promoDiscountBps: toBps(f.discount),
      promoDiscountMonths: int(f.discountMonths),
      agencyReferralFreeMonths: int(f.freeMonths),
      reviewThresholdCents: parseEuros(f.review || "0"),
      payoutMode,
      payoutMethods: methods,
      tiers: parsedTiers,
    };
    const invalid =
      Object.entries(value).some(([k, v]) => v === null && k !== "commissionMonths") ||
      (f.months.trim() !== "" && value.commissionMonths === null) ||
      parsedTiers.some((tier) => !tier.name || tier.minPayingAgencies === null || tier.commissionBps === null);
    if (invalid) return void toast.error(t("invalid"));
    startTransition(async () => {
      const r = await saveSettingAction("affiliates.program", value);
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
      <CardContent className="grid gap-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="prog-enabled" className="text-sm">
              {t("enabled")}
            </label>
            <Switch id="prog-enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="prog-manual" className="text-sm">
              {t("manualApproval")}
            </label>
            <Switch id="prog-manual" checked={manual} onCheckedChange={setManual} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("rate", t("rate"))}
          {field("months", t("months"), t("monthsHint"))}
          {field("cookie", t("cookieDays"))}
          {field("approval", t("approvalDays"))}
          {field("minPayout", t("minPayout"))}
          {field("payoutDay", t("payoutDay"))}
          {field("discount", t("discount"))}
          {field("discountMonths", t("discountMonths"))}
          {field("freeMonths", t("freeMonths"), t("freeMonthsHint"))}
          {field("review", t("review"), t("reviewHint"))}
        </div>

        <fieldset className="grid gap-3">
          <legend className="mb-1 font-medium">{t("payouts")}</legend>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t("payoutMode")}>
            {(["request", "automatic"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={payoutMode === mode}
                onClick={() => setPayoutMode(mode)}
                className={`grid gap-0.5 rounded-xl border p-3 text-left text-sm ${payoutMode === mode ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/40"}`}
              >
                <span className="font-medium">{t(`payoutMode_${mode}`)}</span>
                <span className="text-xs text-muted-foreground">{t(`payoutMode_${mode}Hint`)}</span>
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {(["stripe", "bank_transfer", "paypal"] as const).map((m) => (
              <div key={m} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <label htmlFor={`prog-method-${m}`} className="text-sm">
                  {t(`method_${m}`)}
                </label>
                <Switch id={`prog-method-${m}`} checked={methods[m]} onCheckedChange={(on) => setMethods({ ...methods, [m]: on })} />
              </div>
            ))}
          </div>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="mb-1 font-medium">{t("tiers")}</legend>
          <p className="text-sm text-muted-foreground">{t("tiersHint")}</p>
          {tiers.map((tier, i) => (
            <div key={i} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_7rem_6rem_1.4fr_auto] sm:items-end">
              {(
                [
                  ["name", t("tierName")],
                  ["min", t("tierMin")],
                  ["rate", t("tierRate")],
                  ["perks", t("tierPerks")],
                ] as const
              ).map(([key, label]) => (
                <FormField key={key} id={`tier-${i}-${key}`} label={label}>
                  <Input
                    id={`tier-${i}-${key}`}
                    value={tier[key]}
                    onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, [key]: e.target.value } : x)))}
                  />
                </FormField>
              ))}
              <Button variant="ghost" size="icon" aria-label={t("removeTier", { name: tier.name })} onClick={() => setTiers(tiers.filter((_, j) => j !== i))}>
                <Trash2Icon />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => setTiers([...tiers, { name: "", minPayingAgencies: 0, commissionBps: 0, perks: "", rate: "", min: "" }])}
          >
            <PlusIcon />
            {t("addTier")}
          </Button>
        </fieldset>

        <Button className="w-fit" disabled={pending} onClick={save}>
          {t("save")}
        </Button>
      </CardContent>
    </Card>
  );
}
