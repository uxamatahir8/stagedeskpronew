"use client";

import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { FormMessage } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { authErrorKey } from "@/lib/auth-errors";
import { localePath, safeNext } from "@/lib/paths";
import { PasswordInput } from "@/components/password-input";

export function SignInForm() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);

  function done(twoFactor?: boolean) {
    if (twoFactor) {
      router.push(`/two-factor?next=${encodeURIComponent(next)}`);
      return;
    }
    router.push(next);
    router.refresh();
  }

  async function signInWithPassword(form: FormData) {
    setPending(true);
    setError(null);
    setNotice(null);
    const { data, error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
      callbackURL: localePath(locale, next),
    });
    setPending(false);
    if (error) {
      const key = authErrorKey(error);
      if (key === "auth.signIn.unverified") setNotice(t(key));
      else setError(t(key));
      return;
    }
    done(data && "twoFactorRedirect" in data && Boolean(data.twoFactorRedirect));
  }

  async function sendCode(form: FormData) {
    const address = String(form.get("email"));
    setPending(true);
    setError(null);
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email: address, type: "sign-in" });
    setPending(false);
    if (error) return setError(t(authErrorKey(error)));
    setCodeSentTo(address);
  }

  async function signInWithCode(form: FormData) {
    if (!codeSentTo) return;
    setPending(true);
    setError(null);
    const { data, error } = await authClient.signIn.emailOtp({ email: codeSentTo, otp: String(form.get("code")).trim() });
    setPending(false);
    if (error) return setError(t(authErrorKey(error)));
    done(data && "twoFactorRedirect" in data && Boolean(data.twoFactorRedirect));
  }

  return (
    <Tabs defaultValue="password" onValueChange={() => setError(null)}>
      <TabsList className="w-full">
        <TabsTrigger value="password">{t("auth.signIn.tabPassword")}</TabsTrigger>
        <TabsTrigger value="code">{t("auth.signIn.tabCode")}</TabsTrigger>
      </TabsList>

      <TabsContent value="password" className="mt-4">
        <form action={signInWithPassword} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="signin-email">{t("auth.email")}</Label>
            <Input
              id="signin-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="signin-password">{t("auth.password")}</Label>
              <Link href="/forgot-password" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
                {t("auth.signIn.forgot")}
              </Link>
            </div>
            <PasswordInput id="signin-password" name="password" autoComplete="current-password" required />
          </div>
          <FormMessage>{error}</FormMessage>
          <FormMessage tone="success">{notice}</FormMessage>
          <Button type="submit" disabled={pending}>
            {t("auth.signIn.submit")}
          </Button>
        </form>
      </TabsContent>

      <TabsContent value="code" className="mt-4">
        {codeSentTo ? (
          <form action={signInWithCode} className="grid gap-4">
            <FormMessage tone="success">{t("auth.signIn.codeSent", { email: codeSentTo })}</FormMessage>
            <div className="grid gap-2">
              <Label htmlFor="signin-code">{t("auth.code")}</Label>
              <Input
                id="signin-code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                className="font-mono tracking-[0.4em]"
              />
            </div>
            <FormMessage>{error}</FormMessage>
            <Button type="submit" disabled={pending}>
              {t("auth.signIn.verifyCode")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setCodeSentTo(null)}>
              {t("auth.signIn.otherEmail")}
            </Button>
          </form>
        ) : (
          <form action={sendCode} className="grid gap-4">
            <p className="text-sm text-muted-foreground">{t("auth.signIn.codeIntro")}</p>
            <div className="grid gap-2">
              <Label htmlFor="signin-code-email">{t("auth.email")}</Label>
              <Input
                id="signin-code-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <FormMessage>{error}</FormMessage>
            <Button type="submit" disabled={pending}>
              {t("auth.signIn.sendCode")}
            </Button>
          </form>
        )}
      </TabsContent>
    </Tabs>
  );
}
