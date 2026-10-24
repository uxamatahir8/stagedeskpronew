"use client";

import { RefreshCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { syncPlanAction } from "./actions";

/** Creates the plan's product and prices in Stripe, so agencies can check out. */
export function SyncPlanButton({ planId }: { planId: string }) {
  const t = useTranslations("plans");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="xs"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await syncPlanAction(planId);
          if (!r.ok) return void toast.error(r.message);
          toast.success(r.message);
          router.refresh();
        })
      }
    >
      <RefreshCwIcon className={pending ? "animate-spin" : undefined} />
      {t("sync")}
    </Button>
  );
}
