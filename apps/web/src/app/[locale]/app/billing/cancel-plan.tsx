"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useRouter } from "@/i18n/navigation";
import { setCancelPlanAction } from "./actions";

/**
 * Cancel at the end of the paid period (asks first), or resume while that
 * period is still running. `endsOn` is the formatted end date.
 */
export function CancelPlan({ cancelling, endsOn }: { cancelling: boolean; endsOn: string }) {
  const t = useTranslations("billing");
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (cancel: boolean) =>
    start(async () => {
      const r = await setCancelPlanAction(cancel);
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
    <Dialog>
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
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("keepPlan")}</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant="destructive" onClick={() => run(true)}>
              {t("cancelConfirm")}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
