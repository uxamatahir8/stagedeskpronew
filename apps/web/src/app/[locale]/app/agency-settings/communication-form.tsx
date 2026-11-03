"use client";

import { MailCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { DepositType } from "@stagedesk/core";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useRouter } from "@/i18n/navigation";
import { saveCommunicationSettingsAction, sendSenderTestAction } from "./actions";

export interface CommunicationValues {
  correspondenceLocale: "nl" | "en";
  depositType: DepositType;
  depositPct: string;
  depositFixed: string;
  emailFromName: string;
  emailReplyTo: string;
}

/** Customer communication: the language customers get mail in, the default upfront payment, and how customer mail is signed. */
export function CommunicationForm({ initial, agencyName, contactEmail, platformAddress }: { initial: CommunicationValues; agencyName: string; contactEmail: string | null; platformAddress: string }) {
  const t = useTranslations("communicationSettings");
  const tb = useTranslations("booking");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [v, setV] = useState(initial);
  const set = <K extends keyof CommunicationValues>(key: K, value: CommunicationValues[K]) => setV((x) => ({ ...x, [key]: value }));
  const shownName = `${v.emailFromName.trim() || agencyName} via StageDesk`;
  const replyTo = v.emailReplyTo.trim() || contactEmail;

  function save() {
    start(async () => {
      const result = await saveCommunicationSettingsAction({ ...v, depositPct: Math.min(100, Math.max(0, Number(v.depositPct.replace(",", ".")) || 0)) });
      if (!result.ok) return void toast.error(result.message);
      toast.success(result.message);
      router.refresh();
    });
  }

  function test() {
    start(async () => {
      const result = await sendSenderTestAction();
      if (!result.ok) return void toast.error(result.message);
      toast.success(result.message);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        <FormField id="cm-locale" label={t("language")} hint={t("languageHint")}>
          <NativeSelect id="cm-locale" value={v.correspondenceLocale} onChange={(e) => set("correspondenceLocale", e.target.value as "nl" | "en")} className="w-full">
            <option value="nl">Nederlands</option>
            <option value="en">English</option>
          </NativeSelect>
        </FormField>
        <FormField id="cm-deposit" label={t("deposit")} hint={tb(`depositType_${v.depositType}Hint`)}>
          <NativeSelect id="cm-deposit" value={v.depositType} onChange={(e) => set("depositType", e.target.value as DepositType)} className="w-full">
            {(["none", "percentage", "fixed"] as const).map((k) => (
              <option key={k} value={k}>
                {tb(`depositType_${k}`)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {v.depositType === "percentage" && (
          <FormField id="cm-pct" label={tb("deposit")}>
            <Input id="cm-pct" value={v.depositPct} inputMode="decimal" onChange={(e) => set("depositPct", e.target.value)} />
          </FormField>
        )}
        {v.depositType === "fixed" && (
          <FormField id="cm-fixed" label={tb("depositFixed")}>
            <Input id="cm-fixed" value={v.depositFixed} inputMode="decimal" placeholder="250,00" onChange={(e) => set("depositFixed", e.target.value)} />
          </FormField>
        )}

        <div className="grid gap-4 border-t pt-4 sm:col-span-2 sm:grid-cols-2">
          <FormField id="cm-from" label={t("fromName")} hint={t("fromNameHint")}>
            <Input id="cm-from" value={v.emailFromName} maxLength={120} placeholder={agencyName} onChange={(e) => set("emailFromName", e.target.value)} />
          </FormField>
          <FormField id="cm-reply" label={t("replyTo")} hint={t("replyToHint")}>
            <Input id="cm-reply" type="email" value={v.emailReplyTo} maxLength={191} placeholder={contactEmail ?? ""} onChange={(e) => set("emailReplyTo", e.target.value)} />
          </FormField>
          <div className="rounded-lg bg-muted/60 p-3 text-sm sm:col-span-2">
            <p className="font-medium">{t("previewTitle")}</p>
            <p className="text-muted-foreground">
              {t("previewFrom")}: <span className="text-foreground">{shownName}</span> &lt;{platformAddress}&gt;
            </p>
            <p className="text-muted-foreground">
              {t("previewReply")}: <span className="text-foreground">{replyTo || t("noReplyTo")}</span>
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{t("domainNote")}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button onClick={save} disabled={pending}>
            {t("save")}
          </Button>
          <Button variant="outline" onClick={test} disabled={pending}>
            <MailCheckIcon />
            {t("sendTest")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
