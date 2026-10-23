"use client";

import { CheckCircle2Icon } from "lucide-react";
import { useLocale } from "next-intl";
import { useState, useTransition } from "react";
import { FormMessage } from "@/components/auth/auth-card";
import { Turnstile } from "@/components/turnstile";
import type { FormResult } from "@/lib/site-actions";
import { cn } from "@/lib/utils";

/**
 * A public form with the bot trap and Turnstile built in. Shows `done` once
 * the action succeeds.
 */
export function PublicForm({
  action,
  turnstileKey,
  done,
  className,
  children,
  inverted = false,
}: {
  action: (form: FormData) => Promise<FormResult>;
  turnstileKey: string | null;
  done: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  inverted?: boolean;
}) {
  const locale = useLocale();
  const [result, setResult] = useState<FormResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (result?.ok) {
    return (
      <div className={cn("flex items-start gap-2 rounded-xl border p-4", inverted ? "border-primary-foreground/30 text-primary-foreground" : "bg-card")} role="status">
        <CheckCircle2Icon className={cn("mt-0.5 size-5 shrink-0", inverted ? "text-primary-foreground" : "text-success")} aria-hidden />
        <div>{done}</div>
      </div>
    );
  }

  return (
    <form action={(form) => startTransition(async () => setResult(await action(form)))} className={className} aria-busy={pending}>
      {/* Bot trap: hidden from people and assistive tech. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 overflow-hidden">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      {children}
      {turnstileKey && <Turnstile siteKey={turnstileKey} language={locale} />}
      {result && !result.ok && <FormMessage>{result.message}</FormMessage>}
    </form>
  );
}
