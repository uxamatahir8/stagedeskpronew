"use client";

import { Undo2Icon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { centsToInput } from "@/lib/format";
import { refundAction } from "./actions";

export function RefundDialog({ paymentId, refundableCents, refundableLabel, online }: { paymentId: string; refundableCents: number; refundableLabel: string; online: boolean }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(centsToInput(refundableCents, locale));
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const r = await refundAction(paymentId, amount);
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.message);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Undo2Icon />
          {t("payments.refund")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("payments.refundTitle")}</DialogTitle>
          <DialogDescription>{online ? t("payments.refundBody", { amount: refundableLabel }) : t("payments.refundOffline")}</DialogDescription>
        </DialogHeader>
        <FormField required id={`refund-${paymentId}`} label={t("payments.amount")}>
          <Input required id={`refund-${paymentId}`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </FormField>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("ui.secondary")}</Button>
          </DialogClose>
          <Button variant="destructive" disabled={pending} onClick={submit}>
            {t("payments.refund")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
