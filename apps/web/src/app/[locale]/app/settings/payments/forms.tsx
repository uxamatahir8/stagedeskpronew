"use client";

import { BanknoteIcon, CreditCardIcon, HandCoinsIcon, KeyRoundIcon, PlugZapIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { SettingValue } from "@stagedesk/core";
import { CopyField } from "@/components/copy-field";
import { FormField } from "@/components/form-field";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/actions";
import { saveSettingAction } from "../actions";
import { removeStripeKeysAction, saveStripeKeysAction, testStripeAction } from "./actions";

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
  return { pending, run };
}

type Saved = { hint: string; updatedAt: string } | null;
const fields = ["secretKey", "publishableKey", "webhookSecret"] as const;

/** Stripe keys entered here, the webhook to set up in Stripe, and a connection test. */
export function StripeSetup({
  status,
  saved,
  webhookUrl,
  events,
  connected,
}: {
  status: { source: "dashboard" | "env" | null; mode: "test" | "live" | null; webhook: boolean; publishable: boolean };
  saved: Record<(typeof fields)[number], Saved>;
  webhookUrl: string;
  events: string[];
  connected: { agencies: number; total: number };
}) {
  const t = useTranslations("paymentSetup");
  const { pending, run } = useRun();
  const empty = { secretKey: "", publishableKey: "", webhookSecret: "" };
  const [v, setV] = useState(empty);
  const anySaved = fields.some((f) => saved[f]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <KeyRoundIcon className="size-4" aria-hidden />
          {t("stripeTitle")}
          {status.source ? (
            <Pill tone={status.mode === "live" ? "success" : "info"}>{t(status.mode === "live" ? "modeLive" : "modeTest")}</Pill>
          ) : (
            <Pill tone="warning">{t("notSetUp")}</Pill>
          )}
          {status.source && <Pill tone="neutral">{t(status.source === "dashboard" ? "sourceDashboard" : "sourceEnv")}</Pill>}
        </CardTitle>
        <CardDescription>{t("stripeHint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        {fields.map((f) => (
          <FormField key={f} id={`stripe-${f}`} label={t(`label_${f}`)} hint={saved[f] ? t("savedHint", { hint: saved[f]!.hint, date: saved[f]!.updatedAt }) : t(`hint_${f}`)}>
            <Input
              id={`stripe-${f}`}
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={saved[f] ? saved[f]!.hint : t(`placeholder_${f}`)}
              value={v[f]}
              onChange={(e) => setV({ ...v, [f]: e.target.value })}
            />
          </FormField>
        ))}
        <div className="grid gap-2 rounded-xl border bg-muted/30 p-4">
          <CopyField label={t("webhookUrl")} value={webhookUrl} />
          <p className="text-sm text-muted-foreground">{t("webhookHint")}</p>
          <ul className="flex flex-wrap gap-1.5">
            {events.map((e) => (
              <li key={e} className="rounded-md bg-background px-2 py-0.5 font-mono text-xs">
                {e}
              </li>
            ))}
          </ul>
          {!status.webhook && status.source && <p className="rounded-md bg-warning/18 p-2 text-sm">{t("webhookMissing")}</p>}
        </div>
        <p className="text-sm text-muted-foreground">{t("connectedAgencies", { count: connected.agencies, total: connected.total })}</p>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => run(() => saveStripeKeysAction(v), () => setV(empty))}>
          {t("saveKeys")}
        </Button>
        <Button variant="outline" disabled={pending || !status.source} onClick={() => run(testStripeAction)}>
          <PlugZapIcon />
          {t("test")}
        </Button>
        {anySaved && (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" className="text-destructive">
                <Trash2Icon />
                {t("remove")}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("removeTitle")}</DialogTitle>
                <DialogDescription>{t("removeHint")}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">{t("cancel")}</Button>
                </DialogClose>
                <Button variant="destructive" disabled={pending} onClick={() => run(removeStripeKeysAction)}>
                  {t("remove")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardFooter>
    </Card>
  );
}

type Methods = SettingValue<"payments.methods">;

/** Which ways of paying agencies may offer; each agency chooses within these. */
export function PaymentMethodsForm({ methods, stripeReady }: { methods: Methods; stripeReady: boolean }) {
  const t = useTranslations("paymentSetup");
  const { pending, run } = useRun();
  const [v, setV] = useState(methods);
  const toggles: { key: "online" | "bankTransfer" | "cash"; icon: typeof CreditCardIcon }[] = [
    { key: "online", icon: CreditCardIcon },
    { key: "bankTransfer", icon: BanknoteIcon },
    { key: "cash", icon: HandCoinsIcon },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("methodsTitle")}</CardTitle>
        <CardDescription>{t("methodsHint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {toggles.map(({ key, icon: Icon }) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <label htmlFor={`pm-${key}`} className="flex items-start gap-3 text-sm">
              <Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span className="grid gap-0.5">
                <span className="font-medium">{t(`method_${key}`)}</span>
                <span className="text-muted-foreground">{key === "online" && !stripeReady ? t("onlineNeedsStripe") : t(`method_${key}Hint`)}</span>
              </span>
            </label>
            <Switch id={`pm-${key}`} checked={v[key]} onCheckedChange={(c) => setV({ ...v, [key]: c })} />
          </div>
        ))}
        <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
          <FormField id="pm-days" label={t("confirmWithinDays")} hint={t("confirmWithinDaysHint")}>
            <Input id="pm-days" type="number" min={1} max={60} value={v.confirmWithinDays} onChange={(e) => setV({ ...v, confirmWithinDays: Number(e.target.value) })} />
          </FormField>
          <div className="flex items-center justify-between gap-4 self-end pb-1">
            <label htmlFor="pm-receipts" className="grid gap-0.5 text-sm">
              <span className="font-medium">{t("sendReceipts")}</span>
              <span className="text-muted-foreground">{t("sendReceiptsHint")}</span>
            </label>
            <Switch id="pm-receipts" checked={v.sendReceipts} onCheckedChange={(c) => setV({ ...v, sendReceipts: c })} />
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button disabled={pending} onClick={() => run(() => saveSettingAction("payments.methods", v))}>
          {t("saveMethods")}
        </Button>
      </CardFooter>
    </Card>
  );
}
