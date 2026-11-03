"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useSyncExternalStore } from "react";
import { FormMessage } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { authErrorKey } from "@/lib/auth-errors";
import { safeNext } from "@/lib/paths";
import { PasswordInput } from "@/components/password-input";

const subscribeToHydration = () => () => undefined;

export function SignInForm() {
  const t = useTranslations();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");

  function done(twoFactor?: boolean) {
    if (twoFactor) {
      router.replace(`/two-factor?next=${encodeURIComponent(next)}`);
      return;
    }
    router.replace(next);
  }

  async function signInWithPassword(form: FormData) {
    if (pending) return;
    setPending(true);
    setError(null);
    setNotice(null);
    const { data, error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
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

  async function requestCode(address: string) {
    // Every code request starts with an empty field: a new code replaces the old one.
    setCode("");
    setPending(true);
    setError(null);
    setNotice(null);
    const { error } = await authClient.emailOtp.sendVerificationOtp({ email: address, type: "sign-in" });
    setPending(false);
    if (error) return setError(t(authErrorKey(error)));
    setCodeSentTo(address);
  }

  async function sendCode(form: FormData) {
    if (pending) return;
    await requestCode(String(form.get("email")).trim());
  }

  async function signInWithCode() {
    if (!codeSentTo || pending) return;
    if (!/^\d{6}$/.test(code)) return setError(t("auth.signIn.invalidCode"));
    setPending(true);
    setError(null);
    const { data, error } = await authClient.signIn.emailOtp({ email: codeSentTo, otp: code });
    setPending(false);
    if (error) return setError(t(authErrorKey(error)));
    done(data && "twoFactorRedirect" in data && Boolean(data.twoFactorRedirect));
  }

  const submit = (action: (form: FormData) => Promise<void>) => (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void action(new FormData(event.currentTarget));
  };

  return (
    <Tabs defaultValue="password" onValueChange={() => setError(null)}>
      <TabsList className="w-full">
        <TabsTrigger value="password">{t("auth.signIn.tabPassword")}</TabsTrigger>
        <TabsTrigger value="code">{t("auth.signIn.tabCode")}</TabsTrigger>
      </TabsList>

      <TabsContent value="password" className="mt-4">
        <form method="post" onSubmit={submit(signInWithPassword)} className="grid gap-4">
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
          <Button type="submit" disabled={!hydrated || pending}>
            {t("auth.signIn.submit")}
          </Button>
        </form>
      </TabsContent>

      <TabsContent value="code" className="mt-4">
        {codeSentTo ? (
          // Its own key: React must not reuse the email step's input for the code (it kept the typed address).
          <form key="code-step" method="post" onSubmit={submit(signInWithCode)} className="grid gap-4">
            <FormMessage tone="success">{t("auth.signIn.codeSent", { email: codeSentTo })}</FormMessage>
            <div className="grid gap-2">
              <Label htmlFor="signin-code">{t("auth.code")}</Label>
              <Input
                id="signin-code"
                name="one-time-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
                value={code}
                // Digits only, so a pasted "123 456" or "123-456" still works.
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="font-mono tracking-[0.4em]"
              />
            </div>
            <FormMessage>{error}</FormMessage>
            <Button type="submit" disabled={!hydrated || pending}>
              {t("auth.signIn.verifyCode")}
            </Button>
            <div className="flex flex-wrap justify-center gap-x-2">
              <Button type="button" variant="ghost" disabled={pending} onClick={() => void requestCode(codeSentTo)}>
                {t("auth.signIn.resendCode")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setCodeSentTo(null);
                  setCode("");
                  setError(null);
                }}
              >
                {t("auth.signIn.otherEmail")}
              </Button>
            </div>
          </form>
        ) : (
          <form key="email-step" method="post" onSubmit={submit(sendCode)} className="grid gap-4">
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
            <Button type="submit" disabled={!hydrated || pending}>
              {t("auth.signIn.sendCode")}
            </Button>
          </form>
        )}
      </TabsContent>
    </Tabs>
  );
}
