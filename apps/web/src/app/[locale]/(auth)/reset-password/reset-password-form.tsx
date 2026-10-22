"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormMessage } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { authErrorKey } from "@/lib/auth-errors";

export function ResetPasswordForm() {
  const t = useTranslations();
  const params = useSearchParams();
  const token = params.get("token");
  const [error, setError] = useState<string | null>(params.get("error") ? t("auth.reset.invalidToken") : null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(form: FormData) {
    const password = String(form.get("password"));
    if (password !== String(form.get("confirm"))) return setError(t("auth.reset.mismatch"));
    if (!token) return setError(t("auth.reset.invalidToken"));
    setPending(true);
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    setPending(false);
    if (error) return setError(t(authErrorKey(error)));
    setDone(true);
  }

  if (done) {
    return (
      <div className="grid gap-4">
        <FormMessage tone="success">{t("auth.reset.done")}</FormMessage>
        <Button asChild>
          <Link href="/sign-in">{t("auth.signIn.submit")}</Link>
        </Button>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="grid gap-4">
        <FormMessage>{t("auth.reset.invalidToken")}</FormMessage>
        <Button variant="outline" asChild>
          <Link href="/forgot-password">{t("auth.forgot.submit")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={submit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="reset-password">{t("auth.reset.password")}</Label>
        <Input id="reset-password" name="password" type="password" autoComplete="new-password" minLength={10} required />
        <p className="text-xs text-muted-foreground">{t("auth.signUp.passwordHint")}</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="reset-confirm">{t("auth.reset.confirm")}</Label>
        <Input id="reset-confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      <FormMessage>{error}</FormMessage>
      <Button type="submit" disabled={pending}>
        {t("auth.reset.submit")}
      </Button>
    </form>
  );
}
