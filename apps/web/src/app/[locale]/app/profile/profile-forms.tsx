"use client";

import { ShieldCheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import QRCode from "react-qr-code";
import { toast } from "sonner";
import { FormMessage } from "@/components/auth/auth-card";
import { FormField } from "@/components/form-field";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePathname, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { authErrorKey } from "@/lib/auth-errors";
import { PasswordInput } from "@/components/password-input";
import { passwordProblem } from "@stagedesk/core";

export function DetailsForm({ values }: { values: { name: string; email: string; phone: string; locale: "nl" | "en" } }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [locale, setLocale] = useState(values.locale);
  const [pending, setPending] = useState(false);

  async function save(form: FormData) {
    setPending(true);
    const { error } = await authClient.updateUser({
      name: String(form.get("name")).trim(),
      phone: String(form.get("phone")).trim() || null,
      locale,
    });
    setPending(false);
    if (error) return void toast.error(t(authErrorKey(error)));
    toast.success(t("profile.saved"));
    // Switch the interface to the chosen language.
    router.replace(pathname, { locale });
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profile.details")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={save} className="grid gap-4 sm:grid-cols-2">
          <FormField id="profile-name" label={t("auth.name")}>
            <Input id="profile-name" name="name" defaultValue={values.name} required maxLength={191} autoComplete="name" />
          </FormField>
          <FormField id="profile-email" label={t("auth.email")}>
            <Input id="profile-email" value={values.email} readOnly disabled />
          </FormField>
          <FormField id="profile-phone" label={t("customers.phone")}>
            <Input id="profile-phone" name="phone" type="tel" defaultValue={values.phone} maxLength={32} autoComplete="tel" />
          </FormField>
          <FormField id="profile-locale" label={t("profile.language")}>
            <Select value={locale} onValueChange={(v) => setLocale(v as "nl" | "en")}>
              <SelectTrigger id="profile-locale" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nl">Nederlands</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {t("profile.save")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function PasswordForm() {
  const t = useTranslations();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function change(form: FormData) {
    const next = String(form.get("newPassword"));
    const problem = passwordProblem(next);
    if (problem) return setError(t(`password.problem_${problem}`));
    if (next !== String(form.get("confirmPassword"))) return setError(t("password.mismatch"));
    setPending(true);
    setError(null);
    const { error } = await authClient.changePassword({
      currentPassword: String(form.get("currentPassword")),
      newPassword: next,
      revokeOtherSessions: true,
    });
    setPending(false);
    if (error) return setError(error.code === "INVALID_PASSWORD" ? t("profile.wrongPassword") : t(authErrorKey(error)));
    toast.success(t("profile.passwordChanged"));
    (document.getElementById("password-form") as HTMLFormElement | null)?.reset();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profile.password")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form id="password-form" action={change} className="grid gap-4 sm:grid-cols-2">
          <FormField id="profile-current-password" label={t("profile.currentPassword")}>
            <PasswordInput id="profile-current-password" name="currentPassword" required autoComplete="current-password" />
          </FormField>
          <FormField id="profile-new-password" label={t("profile.newPassword")} className="sm:col-start-1">
            <PasswordInput id="profile-new-password" name="newPassword" required minLength={10} maxLength={128} autoComplete="new-password" meter rules />
          </FormField>
          <FormField id="profile-confirm-password" label={t("password.confirm")}>
            <PasswordInput id="profile-confirm-password" name="confirmPassword" required autoComplete="new-password" matches="profile-new-password" />
          </FormField>
          <div className="sm:col-span-2">
            <FormMessage>{error}</FormMessage>
          </div>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {t("profile.changePassword")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

type Step = { kind: "idle" } | { kind: "password"; turnOn: boolean } | { kind: "verify"; totpURI: string; backupCodes: string[] };

export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function confirmPassword(form: FormData) {
    if (step.kind !== "password") return;
    const password = String(form.get("password"));
    setPending(true);
    setError(null);
    if (step.turnOn) {
      const { data, error } = await authClient.twoFactor.enable({ password });
      setPending(false);
      if (error) return setError(error.code === "INVALID_PASSWORD" ? t("profile.wrongPassword") : t(authErrorKey(error)));
      if (data.method !== "totp") return setError(t("auth.generic"));
      setStep({ kind: "verify", totpURI: data.totpURI, backupCodes: data.backupCodes });
    } else {
      const { error } = await authClient.twoFactor.disable({ password });
      setPending(false);
      if (error) return setError(error.code === "INVALID_PASSWORD" ? t("profile.wrongPassword") : t(authErrorKey(error)));
      toast.success(t("profile.disabled"));
      setStep({ kind: "idle" });
      router.refresh();
    }
  }

  async function verify(form: FormData) {
    setPending(true);
    setError(null);
    const { error } = await authClient.twoFactor.verifyTotp({ code: String(form.get("code")).trim() });
    setPending(false);
    if (error) return setError(t(authErrorKey(error)));
    toast.success(t("profile.enabled"));
    setStep({ kind: "idle" });
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {t("profile.twoFactor")}
          {enabled && <Pill tone="success">{t("profile.statusOn")}</Pill>}
        </CardTitle>
        <CardDescription>{enabled ? t("profile.twoFactorOn") : t("profile.twoFactorOff")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {step.kind === "idle" && (
          <div>
            <Button variant={enabled ? "outline" : "default"} onClick={() => setStep({ kind: "password", turnOn: !enabled })}>
              <ShieldCheckIcon />
              {enabled ? t("profile.disable") : t("profile.enable")}
            </Button>
          </div>
        )}

        {step.kind === "password" && (
          <form action={confirmPassword} className="grid max-w-sm gap-4">
            <FormField id="twofa-password" label={t("profile.confirmPassword")}>
              <PasswordInput id="twofa-password" name="password" required autoComplete="current-password" />
            </FormField>
            <FormMessage>{error}</FormMessage>
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                {t("profile.continue")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setStep({ kind: "idle" })}>
                {t("ui.secondary")}
              </Button>
            </div>
          </form>
        )}

        {step.kind === "verify" && (
          <div className="grid gap-6 md:grid-cols-[auto_1fr]">
            <div className="w-fit rounded-xl border bg-white p-3">
              <QRCode value={step.totpURI} size={168} />
            </div>
            <div className="grid content-start gap-4">
              <p className="text-sm text-muted-foreground">{t("profile.scanQr")}</p>
              <form action={verify} className="grid max-w-xs gap-3">
                <FormField id="twofa-code" label={t("auth.code")}>
                  <Input
                    id="twofa-code"
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    className="font-mono tracking-[0.3em]"
                  />
                </FormField>
                <FormMessage>{error}</FormMessage>
                <Button type="submit" disabled={pending}>
                  {t("profile.verify")}
                </Button>
              </form>
            </div>
            <div className="grid gap-2 md:col-span-2">
              <p className="text-sm font-medium">{t("profile.backupCodes")}</p>
              <p className="text-sm text-muted-foreground">{t("profile.backupCodesBody")}</p>
              <ul className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-3 font-mono text-sm sm:grid-cols-5">
                {step.backupCodes.map((code) => (
                  <li key={code}>{code}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
