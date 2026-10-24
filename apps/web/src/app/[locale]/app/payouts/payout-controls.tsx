"use client";

import { ArrowDownToLineIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { cancelWithdrawalAction, requestWithdrawalAction, savePayoutDetailsAction } from "./actions";

type Method = "stripe" | "bank_transfer" | "paypal";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (task: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) =>
    start(async () => {
      const r = await task();
      if (r.message) (r.ok ? toast.success : toast.error)(r.message);
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  return [pending, run] as const;
}

/** Where the money goes; only the methods the platform allows are offered. */
export function PayoutDetailsForm({
  methods,
  initial,
  stripeReady,
}: {
  methods: Method[];
  initial: { method: Method | null; iban: string; accountName: string; paypalEmail: string };
  stripeReady: boolean;
}) {
  const t = useTranslations("withdrawals");
  const [method, setMethod] = useState<Method>(initial.method && methods.includes(initial.method) ? initial.method : (methods[0] ?? "bank_transfer"));
  const [iban, setIban] = useState(initial.iban);
  const [accountName, setAccountName] = useState(initial.accountName);
  const [paypalEmail, setPaypalEmail] = useState(initial.paypalEmail);
  const [pending, run] = useRun();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => savePayoutDetailsAction({ method, iban, accountName, paypalEmail }));
      }}
    >
      <div role="radiogroup" aria-label={t("method")} className="grid gap-2 sm:grid-cols-3">
        {methods.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={method === m}
            onClick={() => setMethod(m)}
            className={cn("grid gap-0.5 rounded-xl border p-3 text-left text-sm transition-colors", method === m ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:border-primary/40")}
          >
            <span className="font-medium">{t(`method_${m}`)}</span>
            <span className="text-xs text-muted-foreground">{t(`method_${m}Hint`)}</span>
          </button>
        ))}
      </div>
      {method === "bank_transfer" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="payout-iban" label={t("iban")}>
            <Input id="payout-iban" value={iban} onChange={(e) => setIban(e.target.value)} placeholder="NL91 ABNA 0417 1643 00" autoComplete="off" className="font-mono" required />
          </FormField>
          <FormField id="payout-name" label={t("accountName")}>
            <Input id="payout-name" value={accountName} onChange={(e) => setAccountName(e.target.value)} maxLength={120} required />
          </FormField>
        </div>
      )}
      {method === "paypal" && (
        <FormField id="payout-paypal" label={t("paypalEmail")}>
          <Input id="payout-paypal" type="email" value={paypalEmail} onChange={(e) => setPaypalEmail(e.target.value)} required className="sm:max-w-sm" />
        </FormField>
      )}
      {method === "stripe" && <p className="text-sm text-muted-foreground">{stripeReady ? t("stripeHint") : t("stripeNotConnected")}</p>}
      <Button type="submit" variant="outline" className="w-fit" disabled={pending}>
        {t("saveDetails")}
      </Button>
    </form>
  );
}

export function WithdrawButton({ amount, disabledReason }: { amount: string; disabledReason: string | null }) {
  const t = useTranslations("withdrawals");
  const [open, setOpen] = useState(false);
  const [pending, run] = useRun();
  return (
    <div className="grid gap-1.5">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="lg" disabled={Boolean(disabledReason)} className="w-fit">
            <ArrowDownToLineIcon />
            {t("withdraw", { amount })}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmTitle", { amount })}</DialogTitle>
            <DialogDescription>{t("confirmBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button disabled={pending} onClick={() => run(() => requestWithdrawalAction(), () => setOpen(false))}>
              {t("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {disabledReason && <p className="text-sm text-muted-foreground">{disabledReason}</p>}
    </div>
  );
}

export function CancelWithdrawalButton({ payoutId }: { payoutId: string }) {
  const t = useTranslations("withdrawals");
  const [pending, run] = useRun();
  return (
    <Button variant="ghost" size="sm" disabled={pending} onClick={() => window.confirm(t("cancelConfirm")) && run(() => cancelWithdrawalAction(payoutId))}>
      {t("cancelRequest")}
    </Button>
  );
}
