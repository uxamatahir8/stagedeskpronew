"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { confirmClaimAction, rejectClaimAction } from "@/app/[locale]/app/payments/claim-actions";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/actions";

/** Confirm a reported payment (it's in) or mark it as not received, with a reason the customer sees. */
export function ClaimReview({ claimId, paidOn }: { claimId: string; paidOn: string }) {
  const t = useTranslations("paymentClaims");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [receivedOn, setReceivedOn] = useState(paidOn);
  const [reason, setReason] = useState("");
  const run = (task: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const r = await task();
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.message);
      router.refresh();
    });

  return (
    <div className="flex flex-wrap gap-2">
      <Dialog>
        <DialogTrigger asChild>
          <Button size="sm" disabled={pending}>
            <CheckIcon />
            {t("confirm")}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmTitle")}</DialogTitle>
            <DialogDescription>{t("confirmHint")}</DialogDescription>
          </DialogHeader>
          <FormField required id={`cr-date-${claimId}`} label={t("receivedOn")}>
            <Input required id={`cr-date-${claimId}`} type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
          </FormField>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t("cancel")}</Button>
            </DialogClose>
            <Button disabled={pending} onClick={() => run(() => confirmClaimAction(claimId, receivedOn))}>
              <CheckIcon />
              {t("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={pending}>
            <XIcon />
            {t("reject")}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("rejectTitle")}</DialogTitle>
            <DialogDescription>{t("rejectHint")}</DialogDescription>
          </DialogHeader>
          <FormField required id={`cr-reason-${claimId}`} label={t("reason")}>
            <Input required id={`cr-reason-${claimId}`} maxLength={191} value={reason} placeholder={t("reasonPlaceholder")} onChange={(e) => setReason(e.target.value)} />
          </FormField>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t("cancel")}</Button>
            </DialogClose>
            <Button variant="destructive" disabled={pending || !reason.trim()} onClick={() => run(() => rejectClaimAction(claimId, reason))}>
              {t("reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
