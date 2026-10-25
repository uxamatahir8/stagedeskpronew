"use client";

import { CheckIcon, RepeatIcon, Undo2Icon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { answerArtistRequestAction } from "./actions";

/** On your turn: accept, counter or decline. On theirs: withdraw your offer. */
export function RequestActions({ requestId, myTurn, currency }: { requestId: string; myTurn: boolean; currency: string }) {
  const t = useTranslations("artistRequests");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [fee, setFee] = useState("");
  const [message, setMessage] = useState("");
  const run = (action: "accept" | "decline" | "counter" | "withdraw") =>
    start(async () => {
      const r = await answerArtistRequestAction(requestId, action, fee, message);
      if (!r.ok) return void toast.error(r.message);
      toast.success(r.message);
      setOpen(false);
      router.refresh();
    });

  if (!myTurn) {
    return (
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => run("withdraw")}>
        <Undo2Icon />
        {t("withdraw")}
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={pending} onClick={() => run("accept")}>
        <CheckIcon />
        {t("accept")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={pending}>
            <RepeatIcon />
            {t("counter")}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("counterTitle")}</DialogTitle>
            <DialogDescription>{t("counterHint")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <FormField required id="ctr-fee" label={t("fee", { currency })}>
              <Input id="ctr-fee" value={fee} inputMode="decimal" onChange={(e) => setFee(e.target.value)} />
            </FormField>
            <FormField id="ctr-msg" label={t("message")}>
              <Textarea id="ctr-msg" value={message} rows={3} maxLength={2000} onChange={(e) => setMessage(e.target.value)} />
            </FormField>
          </div>
          <DialogFooter>
            <Button disabled={pending || !fee.trim()} onClick={() => run("counter")}>
              {t("sendCounter")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run("decline")}>
        <XIcon />
        {t("decline")}
      </Button>
    </div>
  );
}
