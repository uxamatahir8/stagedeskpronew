"use client";

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { type EventType, eventTypes } from "@stagedesk/core";
import { useFormatter } from "@/components/date-prefs";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { percent } from "@/lib/format";
import { deleteListingAction, saveListingAction } from "./actions";

export type ListingValues = {
  id: string | null;
  title: string;
  description: string;
  price: string;
  vatBps: number;
  depositPct: number;
  hours: string;
  eventTypes: EventType[] | null;
  active: boolean;
};

export function ListingDialog({ listing, vatRates, defaultDepositBps, currency }: { listing?: ListingValues; vatRates: number[]; defaultDepositBps: number; currency: string }) {
  const t = useTranslations("listings");
  const te = useTranslations("eventTypes");
  const format = useFormatter();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const initial: ListingValues = listing ?? { id: null, title: "", description: "", price: "", vatBps: vatRates[0] ?? 2100, depositPct: defaultDepositBps / 100, hours: "", eventTypes: null, active: true };
  const [v, setV] = useState(initial);
  const set = (patch: Partial<ListingValues>) => setV((x) => ({ ...x, ...patch }));
  const toggleType = (type: EventType) => {
    const current = v.eventTypes ?? [...eventTypes];
    const next = current.includes(type) ? current.filter((x) => x !== type) : [...current, type];
    set({ eventTypes: next.length === eventTypes.length ? null : next });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setV(initial);
      }}
    >
      <DialogTrigger asChild>
        {listing ? (
          <Button variant="ghost" size="icon-sm" aria-label={t("edit")}>
            <PencilIcon />
          </Button>
        ) : (
          <Button>
            <PlusIcon />
            {t("add")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{listing ? t("edit") : t("add")}</DialogTitle>
          <DialogDescription>{t("dialogHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField required id="ls-title" label={t("titleLabel")} className="sm:col-span-2">
            <Input id="ls-title" value={v.title} maxLength={120} placeholder={t("titlePlaceholder")} onChange={(e) => set({ title: e.target.value })} />
          </FormField>
          <FormField id="ls-desc" label={t("descriptionLabel")} hint={t("descriptionHint")} className="sm:col-span-2">
            <Textarea id="ls-desc" value={v.description} rows={4} maxLength={3000} onChange={(e) => set({ description: e.target.value })} />
          </FormField>
          <FormField required id="ls-price" label={t("price", { currency })}>
            <Input id="ls-price" value={v.price} inputMode="decimal" placeholder="650" onChange={(e) => set({ price: e.target.value })} />
          </FormField>
          <FormField id="ls-vat" label={t("vat")}>
            <Select value={String(v.vatBps)} onValueChange={(x) => set({ vatBps: Number(x) })}>
              <SelectTrigger id="ls-vat" className="w-full">
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
          </FormField>
          <FormField id="ls-deposit" label={t("deposit")}>
            <Input id="ls-deposit" value={String(v.depositPct)} inputMode="decimal" onChange={(e) => set({ depositPct: Math.min(100, Math.max(0, Number(e.target.value.replace(",", ".")) || 0)) })} />
          </FormField>
          <FormField id="ls-hours" label={t("hours")}>
            <Input id="ls-hours" value={v.hours} inputMode="decimal" placeholder="4" onChange={(e) => set({ hours: e.target.value })} />
          </FormField>
          <fieldset className="grid gap-2 sm:col-span-2">
            <legend className="mb-1 text-sm font-medium">{t("eventTypes")}</legend>
            <div className="flex flex-wrap gap-2">
              {eventTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={v.eventTypes === null || v.eventTypes.includes(type)}
                  onClick={() => toggleType(type)}
                  className="rounded-full border px-3 py-1 text-sm transition-colors aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary"
                >
                  {te(type)}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="flex items-center justify-between gap-4 sm:col-span-2">
            <label htmlFor="ls-active" className="text-sm font-medium">
              {t("active")}
              <span className="block text-xs font-normal text-muted-foreground">{t("activeHint")}</span>
            </label>
            <Switch id="ls-active" checked={v.active} onCheckedChange={(c) => set({ active: c })} />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={pending || !v.title.trim() || !v.price.trim() || (v.eventTypes !== null && v.eventTypes.length === 0)}
            onClick={() =>
              start(async () => {
                const r = await saveListingAction(v);
                if (!r.ok) return void toast.error(r.message);
                toast.success(r.message);
                setOpen(false);
                router.refresh();
              })
            }
          >
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteListingButton({ id }: { id: string }) {
  const t = useTranslations("listings");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={t("delete")}
      disabled={pending}
      onClick={() =>
        start(async () => {
          if (!window.confirm(t("deleteConfirm"))) return;
          const r = await deleteListingAction(id);
          if (r.ok) toast.success(r.message);
          router.refresh();
        })
      }
    >
      <Trash2Icon />
    </Button>
  );
}
