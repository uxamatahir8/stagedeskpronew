import type { Cents } from "./money";

/** Booking lifecycle from the build plan. Every status change goes through `transition()`. */
export const bookingStatuses = [
  "inquiry",
  "quoted",
  "booked",
  "confirmed",
  "completed",
  "settled",
  "declined",
  "expired",
  "cancelled",
] as const;

export type BookingStatus = (typeof bookingStatuses)[number];

/** Statuses where the event is still going to happen. */
export const openStatuses: readonly BookingStatus[] = ["inquiry", "quoted", "booked", "confirmed"];

export const eventTypes = ["wedding", "corporate", "birthday", "party", "festival", "other"] as const;
export type EventType = (typeof eventTypes)[number];

export const bookingActions = [
  "send_quote",
  "decline",
  "expire",
  "accept_quote",
  "artist_accepted",
  "release_artist",
  "complete",
  "settle",
  "cancel",
] as const;

export type BookingAction = (typeof bookingActions)[number];

/** Who is asking. Agency covers owner, admin and staff; permissions narrow it further. */
export type BookingActor = "agency" | "artist" | "customer" | "system";

export interface BookingContext {
  /** Today's date in the Netherlands, "YYYY-MM-DD". */
  today: string;
  /** "YYYY-MM-DD", or null while the customer hasn't picked a date. */
  eventDate: string | null;
  now: Date;
  quoteExpiresAt?: Date | null;
  paidCents?: Cents;
  totalCents?: Cents;
}

export type TransitionError =
  | "invalid_status"
  | "not_allowed"
  | "no_event_date"
  | "event_not_reached"
  | "event_passed"
  | "quote_expired"
  | "quote_still_valid"
  | "not_fully_paid";

interface Rule {
  from: readonly BookingStatus[];
  to: BookingStatus;
  actors: readonly BookingActor[];
  guard?: (ctx: BookingContext, actor: BookingActor) => TransitionError | null;
}

const beforeEvent = (ctx: BookingContext): TransitionError | null =>
  ctx.eventDate && ctx.eventDate < ctx.today ? "event_passed" : null;

const rules: Record<BookingAction, Rule> = {
  // A new quote version; also revives an inquiry whose quote expired.
  send_quote: { from: ["inquiry", "quoted", "expired"], to: "quoted", actors: ["agency"], guard: beforeEvent },
  decline: { from: ["inquiry", "quoted", "expired"], to: "declined", actors: ["agency"] },
  expire: {
    from: ["quoted"],
    to: "expired",
    actors: ["system"],
    guard: (ctx) => (ctx.quoteExpiresAt && ctx.quoteExpiresAt > ctx.now ? "quote_still_valid" : null),
  },
  accept_quote: {
    from: ["quoted"],
    to: "booked",
    actors: ["customer", "agency"],
    guard: (ctx) => {
      if (ctx.quoteExpiresAt && ctx.quoteExpiresAt <= ctx.now) return "quote_expired";
      return beforeEvent(ctx);
    },
  },
  // The assigned artist said yes.
  artist_accepted: { from: ["booked"], to: "confirmed", actors: ["artist"] },
  // The agency takes the artist off a confirmed booking to reassign it.
  release_artist: { from: ["confirmed"], to: "booked", actors: ["agency"] },
  complete: {
    from: ["confirmed"],
    to: "completed",
    actors: ["agency", "artist"],
    guard: (ctx) => {
      if (!ctx.eventDate) return "no_event_date";
      return ctx.eventDate > ctx.today ? "event_not_reached" : null;
    },
  },
  settle: {
    from: ["completed"],
    to: "settled",
    actors: ["agency", "system"],
    guard: (ctx) => ((ctx.paidCents ?? 0) < (ctx.totalCents ?? 0) ? "not_fully_paid" : null),
  },
  cancel: {
    from: ["inquiry", "quoted", "booked", "confirmed", "expired"],
    to: "cancelled",
    actors: ["agency", "customer"],
    guard: (ctx, actor) => {
      // Customers can only cancel before the event; the agency can always close a booking.
      if (actor === "customer") return beforeEvent(ctx);
      return null;
    },
  },
};

export type TransitionResult = { ok: true; to: BookingStatus } | { ok: false; error: TransitionError };

export function transition(
  status: BookingStatus,
  action: BookingAction,
  actor: BookingActor,
  ctx: BookingContext,
): TransitionResult {
  const rule = rules[action];
  if (!rule.from.includes(status)) return { ok: false, error: "invalid_status" };
  if (!rule.actors.includes(actor)) return { ok: false, error: "not_allowed" };
  const error = rule.guard?.(ctx, actor) ?? null;
  return error ? { ok: false, error } : { ok: true, to: rule.to };
}

/** Actions this actor can take right now, for showing buttons. */
export function availableActions(status: BookingStatus, actor: BookingActor, ctx: BookingContext): BookingAction[] {
  return bookingActions.filter((action) => transition(status, action, actor, ctx).ok);
}

/** Today's date in the Netherlands as "YYYY-MM-DD", regardless of server timezone. */
export function todayInNetherlands(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(now);
}

/** The time in the Netherlands as "HH:mm" (24-hour), regardless of server timezone. */
export function timeInNetherlands(now = new Date()): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
}

/** Whether a "YYYY-MM-DD" date, and its "HH:mm" start time if given, has already passed in the Netherlands. */
export function isPastInNetherlands(date: string, time: string | null, now = new Date()): boolean {
  const today = todayInNetherlands(now);
  if (date !== today) return date < today;
  return time !== null && time < timeInNetherlands(now);
}

export type PaymentStatus = "unpaid" | "partially_paid" | "deposit_paid" | "paid";

export function paymentStatus(paid: Cents, total: Cents, deposit: Cents): PaymentStatus {
  if (total > 0 && paid >= total) return "paid";
  if (paid <= 0) return "unpaid";
  if (deposit > 0 && paid >= deposit) return "deposit_paid";
  return "partially_paid";
}

// Without 0/O, 1/I/L so codes can be read aloud over the phone.
const codeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** 8-character public booking code, e.g. "K7Q2M9XA". */
export function generateTrackingCode(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const bytes = random(8);
  let code = "";
  for (const byte of bytes) code += codeAlphabet[byte % codeAlphabet.length];
  return code;
}

/** Invoice numbers run per agency per year: "2027-0042". */
export function formatInvoiceNumber(year: number, sequence: number) {
  return `${year}-${String(sequence).padStart(4, "0")}`;
}
