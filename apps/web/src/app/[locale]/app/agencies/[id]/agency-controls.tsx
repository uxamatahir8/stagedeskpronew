"use client";

import { CalendarPlusIcon, GiftIcon, PauseCircleIcon, PlayCircleIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/actions";
import { deleteAgencyAction, extendTrialAction, grantPlanAction, suspendAgencyAction, updateAgencyAction } from "../actions";

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (task: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      const r = await task();
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.message);
      after?.();
      router.refresh();
    });
  return [pending, run] as const;
}

export interface AgencyDetails {
  name: string;
  slug: string;
  city: string;
  contactEmail: string;
  phone: string;
  website: string;
  kvkNumber: string;
  adminNotes: string;
}

export function DetailsForm({ organizationId, initial }: { organizationId: string; initial: AgencyDetails }) {
  const t = useTranslations("agencyAdmin");
  const [v, setV] = useState(initial);
  const [pending, run] = useRun();
  const field = (key: Exclude<keyof AgencyDetails, "adminNotes">, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <FormField id={`ad-${key}`} label={label}>
      <Input id={`ad-${key}`} value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} {...props} />
    </FormField>
  );
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {field("name", t("agencyName"), { maxLength: 191 })}
        {field("slug", t("slug"), { maxLength: 96 })}
        {field("city", t("city"), { maxLength: 96 })}
        {field("kvkNumber", t("kvk"), { inputMode: "numeric", maxLength: 8 })}
        {field("contactEmail", t("contactEmail"), { type: "email" })}
        {field("phone", t("phone"), { maxLength: 32 })}
        {field("website", t("website"), { maxLength: 191 })}
      </div>
      <FormField id="ad-notes" label={t("adminNotes")} hint={t("adminNotesHint")}>
        <Textarea id="ad-notes" rows={3} value={v.adminNotes} maxLength={5000} onChange={(e) => setV({ ...v, adminNotes: e.target.value })} />
      </FormField>
      <Button className="w-fit" disabled={pending} onClick={() => run(() => updateAgencyAction(organizationId, v))}>
        {t("save")}
      </Button>
    </div>
  );
}

export function SubscriptionControls({ organizationId, plans, currentPlanKey }: { organizationId: string; plans: { key: string; name: string }[]; currentPlanKey: string | null }) {
  const t = useTranslations("agencyAdmin");
  const [days, setDays] = useState("14");
  const [planKey, setPlanKey] = useState(currentPlanKey ?? plans[0]?.key ?? "");
  const [pending, run] = useRun();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-2">
        <FormField id="sub-days" label={t("extendTrial")} hint={t("extendTrialHint")}>
          <div className="flex gap-2">
            <Input id="sub-days" inputMode="numeric" className="w-24" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} />
            <Button variant="outline" disabled={pending} onClick={() => run(() => extendTrialAction(organizationId, Number(days)))}>
              <CalendarPlusIcon />
              {t("extend")}
            </Button>
          </div>
        </FormField>
      </div>
      <FormField id="sub-plan" label={t("grantPlan")} hint={t("grantPlanHint")}>
        <div className="flex gap-2">
          <Select value={planKey} onValueChange={setPlanKey}>
            <SelectTrigger id="sub-plan" className="min-w-0 flex-1">
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
          <Button variant="outline" disabled={pending || !planKey} onClick={() => run(() => grantPlanAction(organizationId, planKey))}>
            <GiftIcon />
            {t("grant")}
          </Button>
        </div>
      </FormField>
    </div>
  );
}

export function SuspendButton({ organizationId, suspended }: { organizationId: string; suspended: boolean }) {
  const t = useTranslations("agencyAdmin");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, run] = useRun();
  if (suspended) {
    return (
      <Button variant="outline" disabled={pending} onClick={() => run(() => suspendAgencyAction(organizationId, false, ""))}>
        <PlayCircleIcon />
        {t("reactivate")}
      </Button>
    );
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <PauseCircleIcon />
          {t("suspend")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("suspendTitle")}</DialogTitle>
          <DialogDescription>{t("suspendHint")}</DialogDescription>
        </DialogHeader>
        <FormField id="suspend-reason" label={t("reason")} hint={t("reasonHint")}>
          <Input id="suspend-reason" value={reason} maxLength={191} onChange={(e) => setReason(e.target.value)} />
        </FormField>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("cancel")}</Button>
          </DialogClose>
          <Button variant="destructive" disabled={pending} onClick={() => run(() => suspendAgencyAction(organizationId, true, reason), () => setOpen(false))}>
            {t("suspend")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteAgencyButton({ organizationId, name, canDelete }: { organizationId: string; name: string; canDelete: boolean }) {
  const t = useTranslations("agencyAdmin");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-destructive hover:text-destructive">
          <Trash2Icon />
          {t("delete")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("deleteTitle", { name })}</DialogTitle>
          <DialogDescription>{canDelete ? t("deleteHint") : t("deleteBlocked")}</DialogDescription>
        </DialogHeader>
        {canDelete && (
          <FormField required id="delete-confirm" label={t("typeName", { name })}>
            <Input required id="delete-confirm" value={confirm} autoComplete="off" onChange={(e) => setConfirm(e.target.value)} />
          </FormField>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("cancel")}</Button>
          </DialogClose>
          {canDelete && (
            <Button
              variant="destructive"
              disabled={pending || confirm.trim() !== name.trim()}
              onClick={() =>
                startTransition(async () => {
                  const r = await deleteAgencyAction(organizationId, confirm, name);
                  if (!r.ok) return void toast.error(r.message);
                  toast.success(t("deleted", { name }));
                  router.push("/app/agencies");
                })
              }
            >
              {t("deleteForever")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
