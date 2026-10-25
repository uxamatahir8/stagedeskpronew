"use client";

import { PlusIcon, SendIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { openTicketAction, replyTicketAction, setTicketStatusAction } from "./actions";

const categories = ["billing", "bookings", "payments", "account", "other"] as const;

export function NewTicketDialog() {
  const t = useTranslations("support");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<(typeof categories)[number]>("bookings");
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const r = await openTicketAction({ subject, category, body });
      if (!r.ok) return void toast.error(r.message);
      toast.success(t("opened", { ref: r.reference }));
      setOpen(false);
      router.push(`/app/support/${r.reference}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon />
          {t("new")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("new")}</DialogTitle>
          <DialogDescription>{t("newHint")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <FormField required id="ticket-subject" label={t("subject")}>
            <Input required id="ticket-subject" value={subject} maxLength={191} onChange={(e) => setSubject(e.target.value)} />
          </FormField>
          <FormField required id="ticket-category" label={t("category")}>
            <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
              <SelectTrigger id="ticket-category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {t(`category_${c}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField required id="ticket-body" label={t("question")} hint={t("questionHint")}>
            <Textarea required id="ticket-body" rows={6} value={body} maxLength={10_000} onChange={(e) => setBody(e.target.value)} />
          </FormField>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t("cancel")}</Button>
          </DialogClose>
          <Button disabled={pending} onClick={submit}>
            {t("send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TicketReply({ reference, closed }: { reference: string; closed: boolean }) {
  const t = useTranslations("support");
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  const run = (task: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) =>
    startTransition(async () => {
      const r = await task();
      if (!r.ok) return void toast.error(r.message);
      if (r.message) toast.success(r.message);
      after?.();
      router.refresh();
    });

  return (
    <div className="grid gap-3">
      <label htmlFor={`reply-${reference}`} className="text-sm font-medium">
        {closed ? t("reopenByReplying") : t("reply")}
      </label>
      <Textarea id={`reply-${reference}`} rows={4} value={body} maxLength={10_000} onChange={(e) => setBody(e.target.value)} />
      <div className="flex flex-wrap justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => run(() => setTicketStatusAction(reference, closed ? "open" : "closed"))}
        >
          {closed ? t("reopen") : t("close")}
        </Button>
        <Button size="sm" disabled={pending || body.trim().length < 2} onClick={() => run(() => replyTicketAction(reference, body), () => setBody(""))}>
          <SendIcon />
          {t("sendReply")}
        </Button>
      </div>
    </div>
  );
}
