"use client";

import { StarIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { submitReviewAction } from "../reviews/actions";

export function ReviewForm({ bookingId }: { bookingId: string }) {
  const t = useTranslations("customerEvent");
  const router = useRouter();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid gap-4"
      action={() =>
        startTransition(async () => {
          const result = await submitReviewAction(bookingId, rating, comment);
          if (!result.ok) return void (result.message && toast.error(result.message));
          toast.success(result.message);
          router.refresh();
        })
      }
    >
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">{t("rating")}</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setRating(n)}
              aria-label={t("stars", { count: n })}
              aria-pressed={rating === n}
              className="rounded p-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <StarIcon className={cn("size-7", n <= rating ? "fill-warning text-warning" : "text-muted-foreground/40")} />
            </button>
          ))}
        </div>
      </fieldset>
      <FormField id="review-comment" label={t("comment")}>
        <Textarea id="review-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={4} maxLength={5000} />
      </FormField>
      <Button type="submit" disabled={pending || rating === 0} className="w-fit">
        {t("submitReview")}
      </Button>
    </form>
  );
}
