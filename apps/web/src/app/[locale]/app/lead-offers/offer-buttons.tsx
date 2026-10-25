"use client";

import { CheckIcon, SendIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useRouter } from "@/i18n/navigation";
import { type BuilderLine, type CatalogItem, QuoteBuilder } from "../bookings/[code]/quote-builder";
import { quoteLeadOfferAction, respondLeadOfferAction } from "./actions";

/**
 * Send a price (the main action: the customer compares prices and picks one),
 * take a lead StageDesk offered directly, or pass.
 */
export function OfferButtons({
  leadId,
  title,
  quoted,
  canTakeDirectly,
  builder,
}: {
  leadId: string;
  title: string;
  quoted: boolean;
  canTakeDirectly: boolean;
  builder: { catalog: CatalogItem[]; vatRates: number[]; initialLines: Omit<BuilderLine, "key">[]; defaultDepositBps: number; defaultExpiryDays: number; currency: string };
}) {
  const t = useTranslations("leadOffers");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // Taking a lead redirects to the new booking; only errors and passes come back here.
  const respond = (accept: boolean) =>
    startTransition(async () => {
      const r = await respondLeadOfferAction(leadId, accept);
      if (!r.ok) toast.error(r.message);
      else toast.success(r.message);
      router.refresh();
    });
  return (
    <div className="flex flex-wrap gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>
            <SendIcon />
            {quoted ? t("changePrice") : t("sendPrice")}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("priceTitle", { title })}</DialogTitle>
            <DialogDescription>{t("priceHint")}</DialogDescription>
          </DialogHeader>
          <QuoteBuilder {...builder} submit={(draft) => quoteLeadOfferAction(leadId, draft)} submitLabel={t("sendPriceButton")} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
      {canTakeDirectly && (
        <Button variant="outline" disabled={pending} onClick={() => respond(true)}>
          <CheckIcon />
          {t("accept")}
        </Button>
      )}
      <Button variant="ghost" disabled={pending} onClick={() => respond(false)}>
        <XIcon />
        {t("decline")}
      </Button>
    </div>
  );
}
