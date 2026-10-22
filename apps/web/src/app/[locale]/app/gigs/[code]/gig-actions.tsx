"use client";

import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/actions";
import { completeGigAction, respondGigAction } from "../actions";

function useRun() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return [
    pending,
    (task: () => Promise<ActionResult>, after?: () => void) =>
      startTransition(async () => {
        const r = await task();
        if (!r.ok) return void (r.message && toast.error(r.message));
        if (r.message) toast.success(r.message);
        after?.();
        router.refresh();
      }),
  ] as const;
}

export function RespondGig({ assignmentId }: { assignmentId: string }) {
  const t = useTranslations();
  const [pending, run] = useRun();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <div className="flex flex-wrap gap-2">
      <Button disabled={pending} onClick={() => run(() => respondGigAction(assignmentId, true, ""))}>
        <CheckIcon />
        {t("gigs.accept")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" disabled={pending}>
            {t("gigs.decline")}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("gigs.decline")}</DialogTitle>
          </DialogHeader>
          <FormField id="gig-reason" label={t("gigs.declineReason")}>
            <Textarea id="gig-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} />
          </FormField>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{t("ui.secondary")}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={pending || !reason.trim()}
              onClick={() => run(() => respondGigAction(assignmentId, false, reason), () => setOpen(false))}
            >
              {t("gigs.decline")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function CompleteGig({ assignmentId }: { assignmentId: string }) {
  const t = useTranslations("gigs");
  const [pending, run] = useRun();
  return (
    <Button disabled={pending} onClick={() => run(() => completeGigAction(assignmentId))}>
      <CheckIcon />
      {t("markDone")}
    </Button>
  );
}
