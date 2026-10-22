"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FormMessage } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { authErrorKey } from "@/lib/auth-errors";
import { safeNext } from "@/lib/paths";

export function TwoFactorForm() {
  const t = useTranslations();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [backup, setBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(form: FormData) {
    const code = String(form.get("code")).trim();
    setPending(true);
    setError(null);
    const { error } = backup
      ? await authClient.twoFactor.verifyBackupCode({ code })
      : await authClient.twoFactor.verifyTotp({ code, trustDevice: form.get("trust") === "on" });
    setPending(false);
    if (error) return setError(t(authErrorKey(error)));
    router.push(next);
    router.refresh();
  }

  return (
    <form action={submit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="twofactor-code">{backup ? t("auth.twoFactor.backupCode") : t("auth.code")}</Label>
        <Input
          id="twofactor-code"
          name="code"
          autoComplete="one-time-code"
          inputMode={backup ? "text" : "numeric"}
          required
          className="font-mono tracking-[0.3em]"
        />
      </div>
      {!backup && (
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="twofactor-trust">{t("auth.twoFactor.trust")}</Label>
          <Switch id="twofactor-trust" name="trust" />
        </div>
      )}
      <FormMessage>{error}</FormMessage>
      <Button type="submit" disabled={pending}>
        {t("auth.twoFactor.submit")}
      </Button>
      <Button type="button" variant="ghost" onClick={() => setBackup((b) => !b)}>
        {backup ? t("auth.twoFactor.useApp") : t("auth.twoFactor.useBackup")}
      </Button>
    </form>
  );
}
