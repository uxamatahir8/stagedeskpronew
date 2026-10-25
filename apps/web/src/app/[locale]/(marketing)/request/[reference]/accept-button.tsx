"use client";

import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useRouter } from "@/i18n/navigation";
import { acceptLeadOfferAction } from "./actions";

/** Accepting is final (the others are told), so it asks once more. */
export function AcceptOfferButton({ reference, token, offerId, provider, total }: { reference: string; token: string; offerId: string; provider: string; total: string }) {
  const t = useTranslations("leadCompare");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full sm:w-auto">
          <CheckIcon />
          {t("accept")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("confirmTitle", { provider })}</DialogTitle>
          <DialogDescription>{t("confirmBody", { provider, total })}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{t("cancel")}</Button>
          </DialogClose>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await acceptLeadOfferAction(reference, token, offerId);
                if (!r.ok) return void toast.error(r.message);
                toast.success(r.message);
                setOpen(false);
                router.refresh();
              })
            }
          >
            <CheckIcon />
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
