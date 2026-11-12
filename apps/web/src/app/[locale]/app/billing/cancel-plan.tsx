"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { type CancellationReason, cancellationReasons } from "@stagedesk/core";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { setCancelPlanAction } from "./actions";

/**
 * Cancel at the end of the paid period (asks first, and why), or resume while
 * that period is still running. `endsOn` is the formatted end date.
 */
export function CancelPlan({ cancelling, endsOn }: { cancelling: boolean; endsOn: string }) {
  const t = useTranslations("billing");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<CancellationReason | null>(null);
  const [note, setNote] = useState("");
  const run = (cancel: boolean) =>
    start(async () => {
      const r = await setCancelPlanAction(cancel, cancel && reason ? { reason, note } : undefined);
      if (r.ok) setOpen(false);
      if (r.message) (r.ok ? toast.success : toast.error)(r.message);
      router.refresh();
    });

  if (cancelling) {
    return (
      <Button variant="outline" size="sm" className="w-fit" disabled={pending} onClick={() => run(false)}>
        {t("resume")}
      </Button>
    );
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="w-fit text-destructive hover:text-destructive" disabled={pending}>
          {t("cancelPlan")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("cancelTitle")}</DialogTitle>
          <DialogDescription>{t("cancelBody", { date: endsOn })}</DialogDescription>
        </DialogHeader>
        <fieldset className="grid gap-2">
          <legend className="pb-1 text-sm font-medium">{t("cancelReasonQuestion")}</legend>
          {cancellationReasons.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm">
              <input type="radio" name="cancel-reason" className="size-4 accent-[var(--primary)]" checked={reason === r} onChange={() => setReason(r)} />
              {t(`cancelReason_${r}`)}
            </label>
          ))}
        </fieldset>
        <label className="grid gap-1.5 text-sm font-medium" htmlFor="cancel-note">
          {t("cancelNote")}
          <Textarea id="cancel-note" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("cancelNotePlaceholder")} />
        </label>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("keepPlan")}</Button>
          </DialogClose>
          <Button variant="destructive" disabled={pending || !reason} onClick={() => run(true)}>
            {t("cancelConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
