"use client";

import { PencilIcon, PlusIcon, TicketPercentIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { parseEuros } from "@stagedesk/core";
import { EmptyState } from "@/components/empty-state";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRouter } from "@/i18n/navigation";
import { deleteBookingPromoAction, saveBookingPromoAction, setBookingPromoActiveAction } from "./actions";

export interface PromoValues {
  code: string;
  description: string;
  discountType: "percentage" | "fixed";
  /** Percentage ("10") or euros ("50,00"). */
  amount: string;
  minimum: string;
  validFrom: string;
  validUntil: string;
  max: string;
  active: boolean;
}

interface CodeRow {
  id: string;
  discount: string;
  valid: string;
  minimum: string;
  uses: string;
  used: boolean;
  values: PromoValues;
}

const blank: PromoValues = { code: "", description: "", discountType: "percentage", amount: "", minimum: "", validFrom: "", validUntil: "", max: "", active: true };

/** An agency's discount codes for its customers: list, switch on/off, edit, delete when unused. */
export function BookingPromoCodes({ codes }: { codes: CodeRow[] }) {
  const t = useTranslations("promoCodes");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<{ id: string | null; values: PromoValues } | null>(null);
  const run = (task: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await task();
      (r.ok ? toast.success : toast.error)(r.message ?? "");
      router.refresh();
    });

  return (
    <Card>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm text-muted-foreground">{t("agencyHint")}</p>
          <Button onClick={() => setEditing({ id: null, values: blank })}>
            <PlusIcon />
            {t("new")}
          </Button>
        </div>
        {codes.length === 0 ? (
          <EmptyState icon={TicketPercentIcon} title={t("noneTitle")} description={t("noneAgency")} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("code")}</TableHead>
                  <TableHead>{t("discount")}</TableHead>
                  <TableHead>{t("valid")}</TableHead>
                  <TableHead>{t("minimum")}</TableHead>
                  <TableHead>{t("uses")}</TableHead>
                  <TableHead>{t("active")}</TableHead>
                  <TableHead className="sr-only">{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {codes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <span className="font-mono font-semibold">{c.values.code}</span>
                      {c.values.description && <span className="block text-xs text-muted-foreground">{c.values.description}</span>}
                    </TableCell>
                    <TableCell className="tabular-nums">{c.discount}</TableCell>
                    <TableCell>{c.valid}</TableCell>
                    <TableCell className="tabular-nums">{c.minimum}</TableCell>
                    <TableCell className="tabular-nums">{c.uses}</TableCell>
                    <TableCell>
                      <Switch checked={c.values.active} disabled={pending} aria-label={t("activeFor", { code: c.values.code })} onCheckedChange={(on) => run(() => setBookingPromoActiveAction(c.id, on))} />
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" aria-label={t("editCode", { code: c.values.code })} onClick={() => setEditing({ id: c.id, values: c.values })}>
                        <PencilIcon />
                      </Button>
                      {!c.used && (
                        <Button variant="ghost" size="icon" aria-label={t("deleteCode", { code: c.values.code })} disabled={pending} onClick={() => run(() => deleteBookingPromoAction(c.id))}>
                          <Trash2Icon />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      {editing && <PromoDialog key={editing.id ?? "new"} id={editing.id} initial={editing.values} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function PromoDialog({ id, initial, onClose }: { id: string | null; initial: PromoValues; onClose: () => void }) {
  const t = useTranslations("promoCodes");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState(initial);
  const set = (patch: Partial<PromoValues>) => setV({ ...v, ...patch });

  function submit() {
    const pct = Number(v.amount.replace(",", "."));
    const cents = parseEuros(v.amount);
    const minimum = v.minimum.trim() ? parseEuros(v.minimum) : null;
    const max = v.max.trim() ? Number(v.max) : null;
    if ((v.discountType === "percentage" && !(pct > 0 && pct <= 100)) || (v.discountType === "fixed" && !(cents && cents > 0))) return void toast.error(t("error_amount"));
    if (v.minimum.trim() && !(minimum && minimum > 0)) return void toast.error(t("error_minimum"));
    if (max !== null && !(Number.isInteger(max) && max > 0)) return void toast.error(t("error_max"));
    if (v.validFrom && v.validUntil && v.validFrom > v.validUntil) return void toast.error(t("error_dates"));
    start(async () => {
      const r = await saveBookingPromoAction(id, {
        code: v.code,
        description: v.description.trim() || null,
        discountType: v.discountType,
        percentBps: v.discountType === "percentage" ? Math.round(pct * 100) : null,
        amountCents: v.discountType === "fixed" ? cents : null,
        minTotalCents: minimum,
        validFrom: v.validFrom || null,
        validUntil: v.validUntil || null,
        maxRedemptions: max,
        active: v.active,
      });
      if (!r.ok) return void toast.error(r.message ?? "");
      toast.success(r.message ?? "");
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{id ? t("editTitle") : t("newAgencyTitle")}</DialogTitle>
          <DialogDescription>{t("newAgencyHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="bp-code" label={t("code")} hint={t("codeHint")}>
            <Input id="bp-code" value={v.code} maxLength={32} className="font-mono uppercase" onChange={(e) => set({ code: e.target.value })} />
          </FormField>
          <FormField id="bp-desc" label={t("description")}>
            <Input id="bp-desc" value={v.description} maxLength={191} onChange={(e) => set({ description: e.target.value })} />
          </FormField>
          <FormField id="bp-type" label={t("discountType")}>
            <NativeSelect id="bp-type" value={v.discountType} onChange={(e) => set({ discountType: e.target.value as "percentage" | "fixed" })}>
              <option value="percentage">{t("type_percentage")}</option>
              <option value="fixed">{t("type_fixedInclVat")}</option>
            </NativeSelect>
          </FormField>
          <FormField id="bp-amount" label={v.discountType === "percentage" ? t("percent") : t("amountInclVat")}>
            <Input id="bp-amount" inputMode="decimal" value={v.amount} onChange={(e) => set({ amount: e.target.value })} />
          </FormField>
          <FormField id="bp-min" label={t("minimumLabel")} hint={t("minimumHint")}>
            <Input id="bp-min" inputMode="decimal" value={v.minimum} onChange={(e) => set({ minimum: e.target.value })} />
          </FormField>
          <FormField id="bp-max" label={t("maxUses")} hint={t("maxUsesHint")}>
            <Input id="bp-max" type="number" min={1} value={v.max} onChange={(e) => set({ max: e.target.value })} />
          </FormField>
          <FormField id="bp-from" label={t("validFrom")}>
            <Input id="bp-from" type="date" value={v.validFrom} onChange={(e) => set({ validFrom: e.target.value })} />
          </FormField>
          <FormField id="bp-until" label={t("validUntil")}>
            <Input id="bp-until" type="date" value={v.validUntil} onChange={(e) => set({ validUntil: e.target.value })} />
          </FormField>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={v.active} onChange={(e) => set({ active: e.target.checked })} />
          {t("activeLabel")}
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button disabled={pending || !v.code.trim() || !v.amount.trim()} onClick={submit}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
