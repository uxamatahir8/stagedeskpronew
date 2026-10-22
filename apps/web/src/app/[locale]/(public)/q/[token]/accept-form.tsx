"use client";

import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { FormMessage } from "@/components/auth/auth-card";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/navigation";
import { acceptQuoteByTokenAction } from "./actions";

export function AcceptQuoteForm({ token, defaultName }: { token: string; defaultName: string }) {
  const t = useTranslations("quotePage");
  const router = useRouter();
  const [name, setName] = useState(defaultName);
  const [agreed, setAgreed] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-4"
      action={() =>
        startTransition(async () => {
          const result = await acceptQuoteByTokenAction(token, name, agreed);
          setMessage(result.message ? { ok: result.ok, text: result.message } : null);
          if (result.ok) router.refresh();
        })
      }
    >
      <FormField id="accept-full-name" label={t("acceptName")}>
        <Input id="accept-full-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={191} autoComplete="name" />
      </FormField>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 size-4 accent-[var(--primary)]" />
        {t("agree")}
      </label>
      {message && <FormMessage tone={message.ok ? "success" : "error"}>{message.text}</FormMessage>}
      <Button type="submit" disabled={pending || !agreed || name.trim().length < 2} className="w-fit">
        <CheckIcon />
        {t("accept")}
      </Button>
    </form>
  );
}
