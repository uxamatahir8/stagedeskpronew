"use client";

import { StarIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toggleFeaturedAction } from "./actions";

/** The star in the blog list: featured posts open the blog. */
export function FeatureButton({ id, featured }: { id: string; featured: boolean }) {
  const t = useTranslations("contentAdmin");
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={pending}
      aria-pressed={featured}
      aria-label={t("featured")}
      title={t(featured ? "unfeature" : "feature")}
      onClick={() =>
        start(async () => {
          const r = await toggleFeaturedAction(id, !featured);
          if (r.message) (r.ok ? toast.success : toast.error)(r.message);
        })
      }
    >
      <StarIcon className={cn(featured && "fill-amber-400 text-amber-500")} />
    </Button>
  );
}
