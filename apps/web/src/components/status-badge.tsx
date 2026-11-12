import { useTranslations } from "next-intl";
import type { BookingStatus, GigState, PaymentStatus } from "@stagedesk/core";
import type { ArtistAccountState } from "@stagedesk/db";
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

const paymentTone: Record<PaymentStatus, Tone> = {
  unpaid: "warning",
  partially_paid: "info",
  deposit_paid: "brand",
  paid: "success",
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const t = useTranslations("paymentStatus");
  return <Pill tone={paymentTone[status]}>{t(status)}</Pill>;
}

const assignmentTone: Record<string, Tone> = { pending: "warning", accepted: "success", declined: "danger", withdrawn: "neutral" };

export function AssignmentStatusBadge({ status }: { status: "pending" | "accepted" | "declined" | "withdrawn" }) {
  const t = useTranslations("assignmentStatus");
  return <Pill tone={assignmentTone[status]}>{t(status)}</Pill>;
}

const gigTone: Record<GigState, Tone> = {
  new_request: "warning",
  pending_response: "warning",
  accepted: "success",
  date_pending: "info",
  completed: "neutral",
  past: "neutral",
  declined: "danger",
  withdrawn: "neutral",
  cancelled: "danger",
};

/** Where a gig stands for the artist, as classified by core's gigState. */
export function GigStateBadge({ state }: { state: GigState }) {
  const t = useTranslations("gigStates");
  return <Pill tone={gigTone[state]}>{t(state)}</Pill>;
}

const artistAccountTone: Record<ArtistAccountState, Tone> = { no_account: "danger", not_member: "danger", disabled: "danger", inactive: "neutral", setup_pending: "warning", active: "success" };

/** Whether an artist profile has someone behind it who can sign in and answer requests. */
export function ArtistAccountBadge({ state }: { state: ArtistAccountState }) {
  const t = useTranslations("artistAccount");
  return <Pill tone={artistAccountTone[state]}>{t(`state_${state}`)}</Pill>;
}

export type { Tone };

const commissionTone: Record<string, Tone> = { pending: "info", review: "warning", approved: "success", requested: "brand", paid: "neutral", cancelled: "danger" };

export function CommissionStatusBadge({ status }: { status: string }) {
  const t = useTranslations("affiliate");
  return <Pill tone={commissionTone[status] ?? "neutral"}>{t(`commission_${status as "pending"}`)}</Pill>;
}
