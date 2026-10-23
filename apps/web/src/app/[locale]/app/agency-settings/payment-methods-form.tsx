"use client";

import { BanknoteIcon, CreditCardIcon, HandCoinsIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Link, useRouter } from "@/i18n/navigation";
import { type PaymentMethodsInput, savePaymentMethodsAction } from "./actions";

/** The ways this agency's customers can pay, and the bank details they see. */
export function PaymentMethodsForm({
  values,
  allowed,
  stripeConnected,
}: {
  values: PaymentMethodsInput;
  allowed: { online: boolean; bankTransfer: boolean; cash: boolean };
  stripeConnected: boolean;
}) {
  const t = useTranslations("agencyPayments");
  const router = useRouter();
  const [v, setV] = useState(values);
  const [pending, startTransition] = useTransition();
  const methods = [
    { key: "acceptOnline", allowedKey: "online", icon: CreditCardIcon },
    { key: "acceptBankTransfer", allowedKey: "bankTransfer", icon: BanknoteIcon },
    { key: "acceptCash", allowedKey: "cash", icon: HandCoinsIcon },
  ] as const;

  function save() {
    startTransition(async () => {
      const r = await savePaymentMethodsAction(v);
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.message);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-4">
          {methods.map(({ key, allowedKey, icon: Icon }) => {
            const off = !allowed[allowedKey];
            return (
              <div key={key} className="flex items-center justify-between gap-4">
                <label htmlFor={`ap-${key}`} className="flex items-start gap-3 text-sm">
                  <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span className="grid gap-0.5">
                    <span className="font-medium">{t(`method_${allowedKey}`)}</span>
                    <span className="text-muted-foreground">
                      {off ? (
                        t("notOffered")
                      ) : key === "acceptOnline" && !stripeConnected ? (
                        <>
                          {t("onlineNotConnected")}{" "}
                          <Link href="/app/payments" className="font-medium text-primary underline-offset-4 hover:underline">
                            {t("connectStripe")}
                          </Link>
                        </>
                      ) : (
                        t(`method_${allowedKey}Hint`)
                      )}
                    </span>
                  </span>
                </label>
                <Switch id={`ap-${key}`} checked={v[key] && !off} disabled={off} onCheckedChange={(c) => setV({ ...v, [key]: c })} />
              </div>
            );
          })}
        </div>
        <div className="grid gap-4 border-t pt-5 sm:grid-cols-2">
          <FormField id="ap-iban" label={t("iban")} hint={t("ibanHint")}>
            <Input id="ap-iban" value={v.iban} maxLength={42} autoComplete="off" spellCheck={false} placeholder="NL91 ABNA 0417 1643 00" onChange={(e) => setV({ ...v, iban: e.target.value })} />
          </FormField>
          <FormField id="ap-name" label={t("accountName")} hint={t("accountNameHint")}>
            <Input id="ap-name" value={v.bankAccountName} maxLength={191} onChange={(e) => setV({ ...v, bankAccountName: e.target.value })} />
          </FormField>
          <FormField id="ap-instructions" label={t("instructions")} hint={t("instructionsHint")} className="sm:col-span-2">
            <Textarea id="ap-instructions" rows={3} maxLength={2000} value={v.paymentInstructions} onChange={(e) => setV({ ...v, paymentInstructions: e.target.value })} />
          </FormField>
        </div>
      </CardContent>
      <CardFooter>
        <Button disabled={pending} onClick={save}>
          {t("save")}
        </Button>
      </CardFooter>
    </Card>
  );
}
