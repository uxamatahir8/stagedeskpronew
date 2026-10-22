"use client";

import { MailCheckIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FormMessage } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { authErrorKey } from "@/lib/auth-errors";
import { localePath, safeNext } from "@/lib/paths";

export function SignUpForm() {
  const t = useTranslations();
  const locale = useLocale();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const invitedEmail = params.get("email") ?? "";
  const invitedAgency = params.get("agency");

  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function signUp(form: FormData) {
    const email = String(form.get("email"));
    setPending(true);
    setError(null);
    const { error } = await authClient.signUp.email({
      name: String(form.get("name")),
      email,
      password: String(form.get("password")),
      locale,
      callbackURL: localePath(locale, next),
    });
    setPending(false);
    if (error) return setError(t(authErrorKey(error)));
    setSentTo(email);
  }

  if (sentTo) {
    return (
      <div className="grid gap-3 rounded-xl border bg-card p-5">
        <MailCheckIcon className="size-6 text-primary" aria-hidden />
        <p className="font-medium">{t("auth.signUp.checkInboxTitle")}</p>
        <p className="text-sm text-muted-foreground">{t("auth.signUp.checkInboxBody", { email: sentTo })}</p>
      </div>
    );
  }

  return (
    <form action={signUp} className="grid gap-4">
      {invitedAgency && <FormMessage tone="success">{t("auth.signUp.invitedTo", { agency: invitedAgency })}</FormMessage>}
      <div className="grid gap-2">
        <Label htmlFor="signup-name">{t("auth.name")}</Label>
        <Input id="signup-name" name="name" autoComplete="name" required maxLength={191} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="signup-email">{t("auth.email")}</Label>
        <Input
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={invitedEmail}
          readOnly={Boolean(invitedEmail)}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="signup-password">{t("auth.password")}</Label>
        <Input id="signup-password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        <p className="text-xs text-muted-foreground">{t("auth.signUp.passwordHint")}</p>
      </div>
      <FormMessage>{error}</FormMessage>
      <Button type="submit" disabled={pending}>
        {t("auth.signUp.submit")}
      </Button>
    </form>
  );
}
