"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { FormMessage } from "@/components/auth/auth-card";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { setupAccountByTokenAction } from "./actions";

/** Creates the customer's own account from the quote: choose a password, then go to the event page. */
export function AccountSetup({ token, email }: { token: string; email: string }) {
  const t = useTranslations("quotePage");
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Card id="account">
      <CardHeader>
        <CardTitle>{t("accountTitle")}</CardTitle>
        <CardDescription>{t("accountBody")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            start(async () => {
              const r = await setupAccountByTokenAction(token, password, repeat);
              if (!r.ok) return setError(r.message);
              router.push(r.next);
              router.refresh();
            });
          }}
        >
          <FormField id="acc-email" label={t("accountEmail")}>
            <Input id="acc-email" value={email} readOnly className="bg-muted/50" autoComplete="username" />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="acc-password" label={t("accountPassword")} hint={t("accountPasswordHint")}>
              <Input id="acc-password" type="password" autoComplete="new-password" minLength={10} required value={password} onChange={(e) => setPassword(e.target.value)} />
            </FormField>
            <FormField id="acc-repeat" label={t("accountRepeat")}>
              <Input id="acc-repeat" type="password" autoComplete="new-password" minLength={10} required value={repeat} onChange={(e) => setRepeat(e.target.value)} />
            </FormField>
          </div>
          <FormMessage>{error}</FormMessage>
          <Button type="submit" disabled={pending} className="w-fit">
            {t("accountSubmit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
