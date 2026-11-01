"use client";

import { CheckCheckIcon, RotateCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/actions";
import { closeShortfallAction, retryEventAction, retryOperationAction } from "./actions";

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      const r = await action();
      if (!r.ok) toast.error(r.message);
      else toast.success(r.message);
      after?.();
      router.refresh();
    });
  return { pending, run };
}

export function RetryEventButton({ eventId }: { eventId: string }) {
  const t = useTranslations("platformPayments");
  const { pending, run } = useRun();
  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => retryEventAction(eventId))}>
      <RotateCwIcon />
      {t("retry")}
    </Button>
  );
}

/** Retry for any open operation; "book with shortfall" only for a refund whose Stripe refund went through. */
export function OperationButtons({ operationId, canClose }: { operationId: string; canClose: boolean }) {
  const t = useTranslations();
  const { pending, run } = useRun();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => retryOperationAction(operationId))}>
        <RotateCwIcon />
        {t("platformPayments.opRetry")}
      </Button>
      {canClose && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" disabled={pending}>
              <CheckCheckIcon />
              {t("platformPayments.opClose")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("platformPayments.opClose")}</DialogTitle>
              <DialogDescription>{t("platformPayments.opCloseConfirm")}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">{t("ui.secondary")}</Button>
              </DialogClose>
              <Button variant="destructive" disabled={pending} onClick={() => run(() => closeShortfallAction(operationId), () => setOpen(false))}>
                {t("platformPayments.opClose")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
