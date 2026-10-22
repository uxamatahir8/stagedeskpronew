"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FormMessage } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { authErrorKey } from "@/lib/auth-errors";
import { localePath } from "@/lib/paths";

export function ForgotPasswordForm() {
  const t = useTranslations();
  const locale = useLocale();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(form: FormData) {
    const email = String(form.get("email"));
    setPending(true);
    setError(null);
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: localePath(locale, "/reset-password") });
    setPending(false);
    // The same answer whether or not the account exists.
    if (error && error.status === 429) return setError(t(authErrorKey(error)));
    setSentTo(email);
  }

  if (sentTo) return <FormMessage tone="success">{t("auth.forgot.sent", { email: sentTo })}</FormMessage>;

  return (
    <form action={submit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="forgot-email">{t("auth.email")}</Label>
        <Input id="forgot-email" name="email" type="email" autoComplete="email" required />
      </div>
      <FormMessage>{error}</FormMessage>
      <Button type="submit" disabled={pending}>
        {t("auth.forgot.submit")}
      </Button>
    </form>
  );
}
