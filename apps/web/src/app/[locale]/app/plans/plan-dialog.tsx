"use client";

import { PencilIcon, PlusIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { countLimits, type FeeRule, featureFlags, fallbackLimits, type PlanLimits } from "@stagedesk/core";
import { draftToFeeRule, type FeeRuleDraft, FeeRuleFields, feeRuleToDraft } from "@/components/fee-rule-fields";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { savePlanAction } from "./actions";

export interface PlanValues {
  id: string | null;
  key: string;
  nameNl: string;
  nameEn: string;
  descriptionNl: string;
  descriptionEn: string;
  monthly: string;
  yearly: string;
  trialEnabled: boolean;
  trialDays: number;
  featuresNl: string;
  featuresEn: string;
  limits: PlanLimits;
  feeRule: FeeRule | null;
  recommended: boolean;
  visible: boolean;
  active: boolean;
  position: number;
}

export function PlanDialog({ plan, nextPosition }: { plan?: PlanValues; nextPosition: number }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const initial: PlanValues = plan ?? {
    id: null,
    key: "",
    nameNl: "",
    nameEn: "",
    descriptionNl: "",
    descriptionEn: "",
    monthly: "",
    yearly: "",
    trialEnabled: false,
    trialDays: 14,
    featuresNl: "",
    featuresEn: "",
    limits: fallbackLimits,
    feeRule: null,
    recommended: false,
    visible: true,
    active: true,
    position: nextPosition,
  };
  const [v, setV] = useState(initial);
  const [counts, setCounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(countLimits.map((k) => [k, initial.limits[k] === null ? "" : String(initial.limits[k])])),
  );
  const [ownFee, setOwnFee] = useState(initial.feeRule !== null);
  const [fee, setFee] = useState<FeeRuleDraft>(feeRuleToDraft(initial.feeRule, locale));
  const set = (patch: Partial<PlanValues>) => setV((x) => ({ ...x, ...patch }));

  function save() {
    const feeRule = ownFee ? draftToFeeRule(fee) : null;
    if (ownFee && !feeRule) return void toast.error(t("plans.invalid"));
    const limits = { ...v.limits };
    for (const k of countLimits) {
      const raw = counts[k]?.trim() ?? "";
      const n = raw === "" ? null : Number(raw);
      if (n !== null && (!Number.isInteger(n) || n < 0)) return void toast.error(t("plans.invalid"));
      limits[k] = n;
    }
    startTransition(async () => {
      const result = await savePlanAction({ ...v, limits, feeRule });
      if (!result.ok) return void toast.error(result.message);
      toast.success(result.message);
      setOpen(false);
      router.refresh();
    });
  }

  const text = (key: keyof PlanValues, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <FormField id={`plan-${key}`} label={label}>
      <Input id={`plan-${key}`} value={String(v[key] ?? "")} onChange={(e) => set({ [key]: e.target.value } as Partial<PlanValues>)} {...props} />
    </FormField>
  );
  const toggle = (key: "recommended" | "visible" | "active", label: string) => (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={`plan-${key}`} className="text-sm">
        {label}
      </label>
      <Switch id={`plan-${key}`} checked={v[key]} onCheckedChange={(c) => set({ [key]: c })} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {plan ? (
          <Button variant="ghost" size="icon-sm" aria-label={t("plans.edit")}>
            <PencilIcon />
          </Button>
        ) : (
          <Button>
            <PlusIcon />
            {t("plans.add")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{plan ? t("plans.edit") : t("plans.add")}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField required id="plan-key" label={t("plans.key")} hint={t("plans.keyHint")}>
              <Input required id="plan-key" value={v.key} disabled={Boolean(plan)} onChange={(e) => set({ key: e.target.value.toLowerCase() })} />
            </FormField>
            <div className="grid content-start gap-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-4">
                <label htmlFor="plan-trialEnabled" className="text-sm font-medium">
                  {t("plans.trialEnabled")}
                </label>
                <Switch id="plan-trialEnabled" checked={v.trialEnabled} onCheckedChange={(c) => set({ trialEnabled: c })} />
              </div>
              <p className="text-xs text-muted-foreground">{t("plans.trialEnabledHint")}</p>
              {v.trialEnabled && text("trialDays", t("plans.trialDays"), { inputMode: "numeric", onChange: (e) => set({ trialDays: Number(e.target.value) || 0 }) })}
            </div>
            {text("nameNl", t("plans.nameNl"))}
            {text("nameEn", t("plans.nameEn"))}
            {text("monthly", t("plans.monthly"), { inputMode: "decimal" })}
            {text("yearly", t("plans.yearly"), { inputMode: "decimal" })}
            {text("descriptionNl", t("plans.descriptionNl"))}
            {text("descriptionEn", t("plans.descriptionEn"))}
            <FormField id="plan-fnl" label={t("plans.featuresNl")}>
              <Textarea id="plan-fnl" rows={4} value={v.featuresNl} onChange={(e) => set({ featuresNl: e.target.value })} />
            </FormField>
            <FormField id="plan-fen" label={t("plans.featuresEn")}>
              <Textarea id="plan-fen" rows={4} value={v.featuresEn} onChange={(e) => set({ featuresEn: e.target.value })} />
            </FormField>
          </div>

          <fieldset className="grid gap-4">
            <legend className="mb-1 font-medium">{t("plans.limits")}</legend>
            <p className="text-sm text-muted-foreground">{t("plans.limitsHint")}</p>
            <div className="grid gap-4 sm:grid-cols-4">
              {countLimits.map((k) => (
                <FormField key={k} id={`plan-${k}`} label={t(`billing.limit_${k}`)}>
                  <Input id={`plan-${k}`} inputMode="numeric" value={counts[k] ?? ""} placeholder="∞" onChange={(e) => setCounts((c) => ({ ...c, [k]: e.target.value }))} />
                </FormField>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {featureFlags.map((f) => (
                <div key={f} className="flex items-center justify-between gap-4">
                  <label htmlFor={`plan-${f}`} className="text-sm">
                    {t(`billing.flag_${f}`)}
                  </label>
                  <Switch id={`plan-${f}`} checked={v.limits[f]} onCheckedChange={(c) => set({ limits: { ...v.limits, [f]: c } })} />
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset className="grid gap-4">
            <legend className="mb-1 font-medium">{t("plans.fee")}</legend>
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="plan-own-fee" className="text-sm">
                {ownFee ? t("plans.fee") : t("plans.feeDefault")}
              </label>
              <Switch id="plan-own-fee" checked={ownFee} onCheckedChange={setOwnFee} />
            </div>
            {ownFee && <FeeRuleFields value={fee} onChange={setFee} idPrefix="plan-fee" />}
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            {toggle("recommended", t("plans.recommended"))}
            {toggle("visible", t("plans.visible"))}
            {toggle("active", t("plans.active"))}
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("ui.secondary")}</Button>
          </DialogClose>
          <Button onClick={save} disabled={pending}>
            {t("plans.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
