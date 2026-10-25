"use client";

import { CheckCircle2Icon, MailIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { subscribeNewsletterAction, type SubscribeResult } from "@/lib/newsletter-actions";
import { cn } from "@/lib/utils";

/** Email field and button; the confirmation email does the rest (double opt-in). */
export function NewsletterForm({ className }: { className?: string }) {
  const t = useTranslations("newsletter");
  const [result, setResult] = useState<SubscribeResult | null>(null);
  const [pending, start] = useTransition();

  if (result?.ok) {
    return (
      <p role="status" className={cn("flex items-start gap-2 text-sm", className)}>
        <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        {result.message}
      </p>
    );
  }
  return (
    <form
      className={cn("grid gap-2", className)}
      onSubmit={(e) => {
        e.preventDefault();
        const email = String(new FormData(e.currentTarget).get("email") ?? "");
        start(async () => setResult(await subscribeNewsletterAction(email)));
      }}
    >
      <label htmlFor="newsletter-email" className="sr-only">
        {t("emailLabel")}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <MailIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id="newsletter-email"
            name="email"
            type="email"
            required
            maxLength={191}
            autoComplete="email"
            placeholder={t("emailPlaceholder")}
            className="h-10 bg-background pl-9"
            aria-invalid={result && !result.ok ? true : undefined}
            aria-describedby="newsletter-help"
          />
        </div>
        <Button type="submit" disabled={pending} className="h-10">
          {t("subscribe")}
        </Button>
      </div>
      <p id="newsletter-help" className={cn("text-xs", result && !result.ok ? "text-destructive" : "text-muted-foreground")}>
        {result && !result.ok ? result.message : t("consent")}
      </p>
    </form>
  );
}
