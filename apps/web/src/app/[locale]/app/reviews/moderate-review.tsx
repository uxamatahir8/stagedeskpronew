"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { moderateReviewAction } from "./actions";

export function ModerateReview({ reviewId }: { reviewId: string }) {
  const t = useTranslations("reviews");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const decide = (approve: boolean) =>
    startTransition(async () => {
      const result = await moderateReviewAction(reviewId, approve);
      toast.success(result.message);
      router.refresh();
    });
  return (
    <div className="flex gap-2">
      <Button size="sm" disabled={pending} onClick={() => decide(true)}>
        {t("approve")}
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => decide(false)}>
        {t("reject")}
      </Button>
    </div>
  );
}
