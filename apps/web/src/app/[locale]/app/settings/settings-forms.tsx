"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { parseEuros, type SettingKey, type SettingValue } from "@stagedesk/core";
import { draftToFeeRule, FeeRuleFields, feeRuleToDraft } from "@/components/fee-rule-fields";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "@/i18n/navigation";
import { centsToInput } from "@/lib/format";
import { saveSettingAction } from "./actions";

function useSave() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const save = <K extends SettingKey>(key: K, value: SettingValue<K> | null, invalidMessage: string) =>
    startTransition(async () => {
      if (value === null) return void toast.error(invalidMessage);
      const r = await saveSettingAction(key, value);
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.message);
      router.refresh();
    });
  return [pending, save] as const;
}

const pctToBps = (s: string) => {
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) : null;
};
const int = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s) : null);
const bpsToPct = (bps: number, locale: string) => String(bps / 100).replace(".", locale === "en" ? "." : ",");

export function SettingsForms({
  fees,
  bookings,
  billing,
  site,
  plans,
}: {
  fees: SettingValue<"fees.platform">;
  bookings: SettingValue<"bookings.defaults">;
  billing: SettingValue<"billing.defaults">;
  site: SettingValue<"site.general">;
  plans: { key: string; name: string }[];
}) {
  const t = useTranslations("platformSettings");
  const locale = useLocale();
  const [pending, save] = useSave();

  const [rule, setRule] = useState(feeRuleToDraft(fees.defaultRule, locale));
  const [paidBy, setPaidBy] = useState(fees.stripeFeePaidBy);
  const [serviceFee, setServiceFee] = useState(centsToInput(fees.customerServiceFeeCents, locale));

  const [b, setB] = useState({
    quoteExpiryDays: String(bookings.quoteExpiryDays),
    depositPct: bpsToPct(bookings.depositBps, locale),
    balanceDue: String(bookings.balanceDueDaysBeforeEvent),
    dispute: String(bookings.payoutDisputeWindowDays),
    vat: bookings.vatRatesBps.map((r) => bpsToPct(r, locale)).join(", "),
  });
  const [grace, setGrace] = useState(String(billing.graceDays));
  const [trialPlan, setTrialPlan] = useState(billing.trialPlanKey);
  const [s, setS] = useState(site);

  const field = (id: string, label: string, value: string, onChange: (v: string) => void, hint?: string) => (
    <FormField id={id} label={label} hint={hint}>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    </FormField>
  );

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("feesTitle")}</CardTitle>
          <CardDescription>{t("feesHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <FeeRuleFields value={rule} onChange={setRule} idPrefix="set-fee" />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="set-paidby" label={t("stripeFeePaidBy")}>
              <Select value={paidBy} onValueChange={(v) => setPaidBy(v as typeof paidBy)}>
                <SelectTrigger id="set-paidby" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agency">{t("paidBy_agency")}</SelectItem>
                  <SelectItem value="platform">{t("paidBy_platform")}</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            {field("set-service", t("serviceFee"), serviceFee, setServiceFee, t("serviceFeeHint"))}
          </div>
          <Button
            className="w-fit"
            disabled={pending}
            onClick={() => {
              const defaultRule = draftToFeeRule(rule);
              const fee = parseEuros(serviceFee || "0");
              save("fees.platform", defaultRule && fee !== null && fee >= 0 ? { defaultRule, stripeFeePaidBy: paidBy, customerServiceFeeCents: fee } : null, t("invalid"));
            }}
          >
            {t("save")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("bookingsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {field("set-expiry", t("quoteExpiryDays"), b.quoteExpiryDays, (v) => setB({ ...b, quoteExpiryDays: v }))}
          {field("set-deposit", t("depositPct"), b.depositPct, (v) => setB({ ...b, depositPct: v }))}
          {field("set-balance", t("balanceDueDays"), b.balanceDue, (v) => setB({ ...b, balanceDue: v }))}
          {field("set-dispute", t("disputeDays"), b.dispute, (v) => setB({ ...b, dispute: v }))}
          {field("set-vat", t("vatRates"), b.vat, (v) => setB({ ...b, vat: v }), t("vatRatesHint"))}
          <div className="sm:col-span-2">
            <Button
              disabled={pending}
              onClick={() => {
                const vat = b.vat.split(/[;,\s]+/).filter(Boolean).map(pctToBps);
                const values = [int(b.quoteExpiryDays), pctToBps(b.depositPct), int(b.balanceDue), int(b.dispute)];
                const ok = values.every((x) => x !== null) && vat.length > 0 && vat.every((x) => x !== null);
                save(
                  "bookings.defaults",
                  ok
                    ? {
                        quoteExpiryDays: values[0]!,
                        depositBps: values[1]!,
                        balanceDueDaysBeforeEvent: values[2]!,
                        payoutDisputeWindowDays: values[3]!,
                        vatRatesBps: vat as number[],
                      }
                    : null,
                  t("invalid"),
                );
              }}
            >
              {t("save")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("billingTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {field("set-grace", t("graceDays"), grace, setGrace)}
          <FormField id="set-trial" label={t("trialPlan")}>
            <Select value={trialPlan} onValueChange={setTrialPlan}>
              <SelectTrigger id="set-trial" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <div className="sm:col-span-2">
            <Button disabled={pending} onClick={() => save("billing.defaults", int(grace) !== null ? { graceDays: int(grace)!, trialPlanKey: trialPlan } : null, t("invalid"))}>
              {t("save")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("siteTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {field("set-name", t("siteName"), s.siteName, (v) => setS({ ...s, siteName: v }))}
          {field("set-support", t("supportEmail"), s.supportEmail, (v) => setS({ ...s, supportEmail: v }))}
          <FormField id="set-locale" label={t("defaultLocale")}>
            <Select value={s.defaultLocale} onValueChange={(v) => setS({ ...s, defaultLocale: v as "nl" | "en" })}>
              <SelectTrigger id="set-locale" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nl">Nederlands</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <div className="flex items-center justify-between gap-4 self-end pb-2">
            <label htmlFor="set-maint" className="text-sm">
              {t("maintenance")}
            </label>
            <Switch id="set-maint" checked={s.maintenanceMode} onCheckedChange={(c) => setS({ ...s, maintenanceMode: c })} />
          </div>
          <div className="flex items-center justify-between gap-4 sm:col-span-2">
            <label htmlFor="set-waitlist" className="text-sm">
              {t("waitlistMode")}
              <span className="block text-xs text-muted-foreground">{t("waitlistModeHint")}</span>
            </label>
            <Switch id="set-waitlist" checked={s.waitlistMode} onCheckedChange={(c) => setS({ ...s, waitlistMode: c })} />
          </div>
          <div className="sm:col-span-2">
            <Button disabled={pending} onClick={() => save("site.general", s, t("invalid"))}>
              {t("save")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
