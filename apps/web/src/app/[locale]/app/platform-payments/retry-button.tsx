"use client";

import { RotateCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { retryEventAction } from "./actions";

export function RetryEventButton({ eventId }: { eventId: string }) {
  const t = useTranslations("platformPayments");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await retryEventAction(eventId);
          if (!r.ok) return void toast.error(r.message);
          toast.success(r.message);
          router.refresh();
        })
      }
    >
      <RotateCwIcon />
      {t("retry")}
    </Button>
  );
}
