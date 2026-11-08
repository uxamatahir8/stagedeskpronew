"use client";

import { PlusIcon, TicketPercentIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { parseEuros } from "@stagedesk/core";
import { EmptyState } from "@/components/empty-state";
import { FormField } from "@/components/form-field";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRouter } from "@/i18n/navigation";
import { createPlatformPromoAction, setPlatformPromoActiveAction } from "./actions";

interface CodeRow {
  id: string;
  code: string;
  description: string | null;
  discount: string;
  duration: string;
  plans: string;
  uses: string;
  expires: string;
  firstOnly: boolean;
  active: boolean;
  inStripe: boolean;
}

/** The platform's promo codes for plans: list, switch on/off, add. A code's discount can't change once made. */
export function SubscriptionCodes({ codes, plans }: { codes: CodeRow[]; plans: { key: string; name: string }[] }) {
  const t = useTranslations("promoCodes");
  const router = useRouter();
  const [pending, start] = useTransition();
  const toggle = (id: string, active: boolean) =>
    start(async () => {
      const r = await setPlatformPromoActiveAction(id, active);
      (r.ok ? toast.success : toast.error)(r.message ?? "");
      router.refresh();
    });

  return (
    <Card>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm text-muted-foreground">{t("platformHint")}</p>
          <NewPlatformCode plans={plans} />
        </div>
        {codes.length === 0 ? (
          <EmptyState icon={TicketPercentIcon} title={t("noneTitle")} description={t("nonePlatform")} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("code")}</TableHead>
                  <TableHead>{t("discount")}</TableHead>
                  <TableHead>{t("duration")}</TableHead>
                  <TableHead>{t("plans")}</TableHead>
                  <TableHead>{t("uses")}</TableHead>
                  <TableHead>{t("expires")}</TableHead>
                  <TableHead>{t("active")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {codes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <span className="font-mono font-semibold">{c.code}</span>
                      {c.description && <span className="block text-xs text-muted-foreground">{c.description}</span>}
                      <span className="mt-1 flex flex-wrap gap-1">
                        {c.firstOnly && <Pill tone="neutral">{t("firstOnlyShort")}</Pill>}
                        {!c.inStripe && c.active && <Pill tone="warning">{t("notInStripe")}</Pill>}
                      </span>
                    </TableCell>
                    <TableCell className="tabular-nums">{c.discount}</TableCell>
                    <TableCell>{c.duration}</TableCell>
                    <TableCell className="max-w-48">{c.plans}</TableCell>
                    <TableCell className="tabular-nums">{c.uses}</TableCell>
                    <TableCell>{c.expires}</TableCell>
                    <TableCell>
                      <Switch checked={c.active} disabled={pending} aria-label={t("activeFor", { code: c.code })} onCheckedChange={(on) => toggle(c.id, on)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NewPlatformCode({ plans }: { plans: { key: string; name: string }[] }) {
  const t = useTranslations("promoCodes");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [v, setV] = useState({ code: "", description: "", discountType: "percentage" as "percentage" | "fixed", amount: "", duration: "once" as "once" | "repeating" | "forever", months: "3", planKeys: [] as string[], firstOnly: true, max: "", expires: "" });
  const set = (patch: Partial<typeof v>) => setV({ ...v, ...patch });

  function submit() {
    const pct = Number(v.amount.replace(",", "."));
    const cents = parseEuros(v.amount);
    const max = v.max.trim() ? Number(v.max) : null;
    const months = Number(v.months);
    if ((v.discountType === "percentage" && !(pct > 0 && pct <= 100)) || (v.discountType === "fixed" && !(cents && cents > 0))) return void toast.error(t("error_amount"));
    if (max !== null && !(Number.isInteger(max) && max > 0)) return void toast.error(t("error_max"));
    start(async () => {
      const r = await createPlatformPromoAction({
        code: v.code,
        description: v.description.trim() || null,
        discountType: v.discountType,
        percentBps: v.discountType === "percentage" ? Math.round(pct * 100) : null,
        amountCents: v.discountType === "fixed" ? cents : null,
        duration: v.duration,
        durationMonths: v.duration === "repeating" && Number.isInteger(months) ? months : null,
        planKeys: v.planKeys,
        firstSubscriptionOnly: v.firstOnly,
        maxRedemptions: max,
        expiresAt: v.expires || null,
      });
      if (!r.ok) return void toast.error(r.message ?? "");
      toast.success(r.message ?? "");
      setOpen(false);
      setV({ ...v, code: "", description: "", amount: "", max: "", expires: "" });
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon />
          {t("new")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("newPlatformTitle")}</DialogTitle>
          <DialogDescription>{t("newPlatformHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="pc-code" label={t("code")} hint={t("codeHint")}>
            <Input id="pc-code" value={v.code} maxLength={32} className="font-mono uppercase" onChange={(e) => set({ code: e.target.value })} />
          </FormField>
          <FormField id="pc-desc" label={t("description")}>
            <Input id="pc-desc" value={v.description} maxLength={191} onChange={(e) => set({ description: e.target.value })} />
          </FormField>
          <FormField id="pc-type" label={t("discountType")}>
            <NativeSelect id="pc-type" value={v.discountType} onChange={(e) => set({ discountType: e.target.value as "percentage" | "fixed" })}>
              <option value="percentage">{t("type_percentage")}</option>
              <option value="fixed">{t("type_fixed")}</option>
            </NativeSelect>
          </FormField>
          <FormField id="pc-amount" label={v.discountType === "percentage" ? t("percent") : t("amount")}>
            <Input id="pc-amount" inputMode="decimal" value={v.amount} onChange={(e) => set({ amount: e.target.value })} />
          </FormField>
          <FormField id="pc-duration" label={t("duration")}>
            <NativeSelect id="pc-duration" value={v.duration} onChange={(e) => set({ duration: e.target.value as typeof v.duration })}>
              <option value="once">{t("duration_once")}</option>
              <option value="repeating">{t("duration_repeating")}</option>
              <option value="forever">{t("duration_forever")}</option>
            </NativeSelect>
          </FormField>
          {v.duration === "repeating" && (
            <FormField id="pc-months" label={t("months")}>
              <Input id="pc-months" type="number" min={1} max={36} value={v.months} onChange={(e) => set({ months: e.target.value })} />
            </FormField>
          )}
          <FormField id="pc-max" label={t("maxUses")} hint={t("maxUsesHint")}>
            <Input id="pc-max" type="number" min={1} value={v.max} onChange={(e) => set({ max: e.target.value })} />
          </FormField>
          <FormField id="pc-expires" label={t("expiresOn")} hint={t("expiresHint")}>
            <Input id="pc-expires" type="date" value={v.expires} onChange={(e) => set({ expires: e.target.value })} />
          </FormField>
        </div>
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">{t("plans")}</legend>
          <p className="text-xs text-muted-foreground">{t("plansHint")}</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {plans.map((p) => (
              <label key={p.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primary)]"
                  checked={v.planKeys.includes(p.key)}
                  onChange={(e) => set({ planKeys: e.target.checked ? [...v.planKeys, p.key] : v.planKeys.filter((k) => k !== p.key) })}
                />
                {p.name}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={v.firstOnly} onChange={(e) => set({ firstOnly: e.target.checked })} />
          {t("firstOnly")}
        </label>
        <DialogFooter>
          <Button disabled={pending || !v.code.trim() || !v.amount.trim()} onClick={submit}>
            {t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
