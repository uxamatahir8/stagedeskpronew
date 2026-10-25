"use client";

import { CheckCircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/actions";
import type { ReportPaymentInput } from "@/lib/pay-actions";

/** "I've paid": the customer tells the agency about a transfer or cash payment, for the agency to confirm. */
export function ReportPaymentDialog({
  report,
  methods,
  defaultAmount,
  today,
  reference,
}: {
  report: (input: ReportPaymentInput) => Promise<ActionResult>;
  methods: ("bank_transfer" | "cash")[];
  defaultAmount: string;
  today: string;
  reference: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<ReportPaymentInput>({ method: methods[0]!, amount: defaultAmount, paidOn: today, reference });
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const r = await report(v);
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.message);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-fit">
          <CheckCircleIcon />
          {t("pay.reportButton")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("pay.reportTitle")}</DialogTitle>
          <DialogDescription>{t("pay.reportHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {methods.length > 1 && (
            <FormField required id="rp-method" label={t("pay.reportMethod")} className="sm:col-span-2">
              <Select value={v.method} onValueChange={(m) => setV({ ...v, method: m as ReportPaymentInput["method"] })}>
                <SelectTrigger id="rp-method" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {methods.map((m) => (
                    <SelectItem key={m} value={m}>
                      {t(`paymentMethods.${m}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}
          <FormField required id="rp-amount" label={t("pay.reportAmount")}>
            <Input required id="rp-amount" inputMode="decimal" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />
          </FormField>
          <FormField required id="rp-date" label={t("pay.reportDate")}>
            <Input required id="rp-date" type="date" max={today} value={v.paidOn} onChange={(e) => setV({ ...v, paidOn: e.target.value })} />
          </FormField>
          {v.method === "bank_transfer" && (
            <FormField id="rp-reference" label={t("pay.reportReference")} hint={t("pay.reportReferenceHint")} className="sm:col-span-2">
              <Input id="rp-reference" maxLength={191} value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} />
            </FormField>
          )}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("pay.cancel")}</Button>
          </DialogClose>
          <Button disabled={pending} onClick={submit}>
            {t("pay.reportSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
