"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { respondLeadOfferAction } from "./actions";

export function OfferButtons({ leadId }: { leadId: string }) {
  const t = useTranslations("leadOffers");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Accepting redirects to the new booking; only errors and declines come back here.
  const respond = (accept: boolean) =>
    startTransition(async () => {
      const r = await respondLeadOfferAction(leadId, accept);
      if (!r.ok) toast.error(r.message);
      else toast.success(r.message);
      router.refresh();
    });
  return (
    <div className="flex flex-wrap gap-2">
      <Button disabled={pending} onClick={() => respond(true)}>
        <CheckIcon />
        {t("accept")}
      </Button>
      <Button variant="outline" disabled={pending} onClick={() => respond(false)}>
        <XIcon />
        {t("decline")}
      </Button>
    </div>
  );
}
