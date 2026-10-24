"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { approveWithdrawalAction, markWithdrawalPaidAction, rejectWithdrawalAction, retryWithdrawalAction } from "./actions";

/**
 * What an admin can do with a withdrawal, by its status: approve or reject a
 * request, mark an approved bank or PayPal payout as paid, retry a failed
 * Stripe transfer.
 */
export function WithdrawalActions({ payoutId, status, method, today }: { payoutId: string; status: string; method: string; today: string }) {
  const t = useTranslations("withdrawals");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<"reject" | "paid" | null>(null);
  const [reason, setReason] = useState("");
  const [ref, setRef] = useState("");
  const [paidOn, setPaidOn] = useState(today);

  const run = (task: () => Promise<{ ok: boolean; message?: string }>) =>
    start(async () => {
      const r = await task();
      if (r.message) (r.ok ? toast.success : toast.error)(r.message);
      if (r.ok) {
        setDialog(null);
        router.refresh();
      }
    });

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {status === "requested" && (
        <>
          <Button size="sm" disabled={pending} onClick={() => run(() => approveWithdrawalAction(payoutId))}>
            {method === "stripe" ? t("approveAndPay") : t("approve")}
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setDialog("reject")}>
            {t("reject")}
          </Button>
        </>
      )}
      {status === "approved" && method !== "stripe" && (
        <>
          <Button size="sm" disabled={pending} onClick={() => setDialog("paid")}>
            {t("markPaid")}
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setDialog("reject")}>
            {t("reject")}
          </Button>
        </>
      )}
      {status === "failed" && (
        <>
          {method === "stripe" && (
            <Button size="sm" disabled={pending} onClick={() => run(() => retryWithdrawalAction(payoutId))}>
              {t("retry")}
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setDialog("paid")}>
            {t("markPaid")}
          </Button>
        </>
      )}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog === "reject" ? t("rejectTitle") : t("markPaidTitle")}</DialogTitle>
            <DialogDescription>{dialog === "reject" ? t("rejectHint") : t("markPaidHint")}</DialogDescription>
          </DialogHeader>
          {dialog === "reject" ? (
            <FormField id="wd-reason" label={t("rejectReason")}>
              <Textarea id="wd-reason" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
            </FormField>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="wd-ref" label={t("transactionRef")} hint={t("transactionRefHint")}>
                <Input id="wd-ref" maxLength={120} value={ref} onChange={(e) => setRef(e.target.value)} />
              </FormField>
              <FormField id="wd-date" label={t("paidOn")}>
                <Input id="wd-date" type="date" max={today} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
              </FormField>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              {t("cancel")}
            </Button>
            {dialog === "reject" ? (
              <Button variant="destructive" disabled={pending || !reason.trim()} onClick={() => run(() => rejectWithdrawalAction(payoutId, reason))}>
                {t("reject")}
              </Button>
            ) : (
              <Button disabled={pending || !ref.trim()} onClick={() => run(() => markWithdrawalPaidAction(payoutId, ref, paidOn))}>
                {t("markPaid")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
