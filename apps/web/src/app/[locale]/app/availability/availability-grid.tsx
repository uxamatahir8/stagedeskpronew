"use client";

import { useTranslations } from "next-intl";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { MonthGrid } from "@/components/month-grid";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { toggleMyDateAction } from "./actions";

export function AvailabilityGrid({
  month,
  today,
  weekdays,
  blocked,
  gigs,
}: {
  month: string;
  today: string;
  weekdays: string[];
  blocked: string[];
  gigs: string[];
}) {
  const t = useTranslations("availability");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [shown, toggle] = useOptimistic(new Set(blocked), (set: Set<string>, date: string) => {
    const next = new Set(set);
    if (next.has(date)) next.delete(date);
    else next.add(date);
    return next;
  });
  const gigDays = new Set(gigs);

  function flip(date: string) {
    const blocking = !shown.has(date);
    startTransition(async () => {
      toggle(date);
      const result = await toggleMyDateAction(date, blocking);
      if (!result.ok) toast.error(result.message);
      router.refresh();
    });
  }

  return (
    <MonthGrid
      month={month}
      today={today}
      weekdays={weekdays}
      dayClassName={(date) => (shown.has(date) ? "bg-destructive/10" : gigDays.has(date) ? "bg-success/12" : undefined)}
      renderDay={(date) => {
        const past = date < today;
        const label = gigDays.has(date) ? t("gig") : shown.has(date) ? t("unavailable") : t("free");
        return (
          <button
            type="button"
            disabled={past || gigDays.has(date) || !date.startsWith(month)}
            onClick={() => flip(date)}
            aria-pressed={shown.has(date)}
            aria-label={`${date}: ${label}`}
            className={cn(
              "w-full rounded px-1 py-0.5 text-left text-xs",
              shown.has(date) && "font-medium text-destructive",
              gigDays.has(date) && "font-medium text-success",
              !past && !gigDays.has(date) && date.startsWith(month) && "hover:bg-accent",
              (past || !date.startsWith(month)) && "cursor-default text-muted-foreground/60",
            )}
          >
            {gigDays.has(date) || shown.has(date) ? label : " "}
          </button>
        );
      }}
    />
  );
}
