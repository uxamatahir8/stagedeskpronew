import { useTranslations } from "next-intl";
import type { BookingStatus } from "@stagedesk/core";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "info" | "brand" | "success" | "warning" | "danger";

const tones: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-info/12 text-info",
  brand: "bg-primary/12 text-primary",
  success: "bg-success/14 text-success",
  warning: "bg-warning/18 text-foreground",
  danger: "bg-destructive/12 text-destructive",
};

const bookingTone: Record<BookingStatus, Tone> = {
  inquiry: "info",
  quoted: "warning",
  booked: "brand",
  confirmed: "success",
  completed: "neutral",
  settled: "neutral",
  declined: "danger",
  expired: "neutral",
  cancelled: "danger",
};

export function Pill({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  );
}

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const t = useTranslations("bookingStatus");
  return <Pill tone={bookingTone[status]}>{t(status)}</Pill>;
}
