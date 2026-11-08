"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { FormMessage } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/password-input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { authErrorKey } from "@/lib/auth-errors";
import { passwordProblem } from "@stagedesk/core";

/** `token` is null when the link is missing, used or expired (checked by the page). */
export function ResetPasswordForm({ token, setup }: { token: string | null; setup: boolean }) {
  const t = useTranslations();
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(token === null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !token) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    const problem = passwordProblem(password);
    if (problem) return setError(t(`password.problem_${problem}`));
    if (password !== String(form.get("confirm"))) return setError(t("auth.reset.mismatch"));
    setPending(true);
    setError(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    if (error) {
      setPending(false);
      // Used in another tab, or it ran out while the form was open.
      if (error.code === "INVALID_TOKEN") return setExpired(true);
      return setError(t(authErrorKey(error)));
    }
    // The reset ends that account's sessions. Someone else signed in in this browser (an admin
    // trying the link) is signed out too, so "sign in" leads to the form, not their dashboard.
    await authClient.signOut().catch(() => undefined);
    setPending(false);
    setDone(true);
  }

  if (done) {
    return (
      <div className="grid gap-4">
        <FormMessage tone="success">{setup ? t("auth.reset.setupDone") : t("auth.reset.done")}</FormMessage>
        <Button asChild>
          <Link href="/sign-in">{t("auth.signIn.submit")}</Link>
        </Button>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="grid gap-4">
        <FormMessage>{t("auth.reset.invalidToken")}</FormMessage>
        <Button asChild>
          <Link href="/forgot-password">{t("auth.reset.requestNew")}</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/sign-in">{t("auth.forgot.back")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form method="post" onSubmit={submit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="reset-password">{t("auth.reset.password")}</Label>
        <PasswordInput id="reset-password" name="password" autoComplete="new-password" minLength={10} maxLength={128} required meter rules />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="reset-confirm">{t("auth.reset.confirm")}</Label>
        <PasswordInput id="reset-confirm" name="confirm" autoComplete="new-password" required matches="reset-password" />
      </div>
      <FormMessage>{error}</FormMessage>
      <Button type="submit" disabled={pending}>
        {t("auth.reset.submit")}
      </Button>
    </form>
  );
}
