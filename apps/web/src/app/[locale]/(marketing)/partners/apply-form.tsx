"use client";

import { MailCheckIcon, PartyPopperIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { FormMessage } from "@/components/auth/auth-card";
import { FormField } from "@/components/form-field";
import { Turnstile } from "@/components/turnstile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { applyAction, type ApplyResult } from "./actions";

export function ApplyForm({ signedInAs, turnstileKey, linkBase }: { signedInAs: string | null; turnstileKey: string | null; linkBase: string }) {
  const t = useTranslations("partners");
  const locale = useLocale();
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();

  if (result?.ok) {
    return (
      <div className="grid gap-3 rounded-xl border bg-card p-5">
        {result.checkEmail ? <MailCheckIcon className="size-6 text-primary" aria-hidden /> : <PartyPopperIcon className="size-6 text-primary" aria-hidden />}
        <p className="font-medium">{t("thanksTitle")}</p>
        <p className="text-sm text-muted-foreground">{result.checkEmail ? t("thanksEmail", { email: result.checkEmail }) : t("thanksSignedIn")}</p>
        {!result.checkEmail && (
          <Button asChild className="w-fit">
            <Link href="/app">{t("toDashboard")}</Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <form action={(form) => startTransition(async () => setResult(await applyAction(form)))} className="grid gap-4">
      {signedInAs && <FormMessage tone="success">{t("signedInAs", { email: signedInAs })}</FormMessage>}
      <FormField id="apply-name" label={t("name")}>
        <Input id="apply-name" name="name" autoComplete="name" required minLength={2} maxLength={191} />
      </FormField>
      {!signedInAs && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="apply-email" label={t("email")}>
            <Input id="apply-email" name="email" type="email" autoComplete="email" required />
          </FormField>
          <FormField id="apply-password" label={t("password")} hint={t("passwordHint")}>
            <Input id="apply-password" name="password" type="password" autoComplete="new-password" minLength={10} required />
          </FormField>
        </div>
      )}
      <FormField id="apply-website" label={t("website")}>
        <Input id="apply-website" name="website" type="url" placeholder="https://" maxLength={191} />
      </FormField>
      <FormField id="apply-pitch" label={t("pitch")} hint={t("pitchHint")}>
        <Textarea id="apply-pitch" name="pitch" rows={4} required minLength={20} maxLength={2000} />
      </FormField>
      <FormField id="apply-code" label={t("code")} hint={t("codeHint", { link: `${linkBase}?via=${code || t("codeExample")}` })}>
        <Input
          id="apply-code"
          name="code"
          maxLength={24}
          pattern="[a-z0-9]{3,24}"
          value={code}
          onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))}
        />
      </FormField>
      {turnstileKey && <Turnstile siteKey={turnstileKey} language={locale} />}
      {result && !result.ok && <FormMessage>{result.message}</FormMessage>}
      <Button type="submit" disabled={pending} className="w-fit">
        {t("submit")}
      </Button>
    </form>
  );
}
