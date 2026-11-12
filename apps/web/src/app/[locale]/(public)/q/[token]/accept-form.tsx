"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { FormMessage } from "@/components/auth/auth-card";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { acceptQuoteByTokenAction, declineQuoteByTokenAction } from "./actions";

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

/** "No thanks": tells the agency now, with an optional reason, instead of letting the quote expire. */
export function DeclineQuoteButton({ token }: { token: string }) {
  const t = useTranslations("quotePage");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" className="w-fit text-muted-foreground">
          <XIcon />
          {t("decline")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("declineTitle")}</DialogTitle>
          <DialogDescription>{t("declineBody")}</DialogDescription>
        </DialogHeader>
        <FormField id="decline-reason" label={t("declineReason")}>
          <Textarea id="decline-reason" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
        </FormField>
        {message && <FormMessage>{message}</FormMessage>}
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await declineQuoteByTokenAction(token, reason.trim());
                if (!r.ok) return void setMessage(r.message ?? null);
                setOpen(false);
                router.refresh();
              })
            }
          >
            {t("declineConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
