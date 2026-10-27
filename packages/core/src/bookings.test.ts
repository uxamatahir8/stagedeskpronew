import { describe, expect, it } from "vitest";
import {
  availableActions,
  type BookingContext,
  bookingActions,
  bookingStatuses,
  formatInvoiceNumber,
  generateTrackingCode,
  paymentStatus,
  isPastInNetherlands,
  timeInNetherlands,
  todayInNetherlands,
  transition,
} from "./bookings";

const now = new Date("2027-05-01T10:00:00Z");
const ctx = (over: Partial<BookingContext> = {}): BookingContext => ({
  today: "2027-05-01",
  eventDate: "2027-06-12",
  now,
  quoteExpiresAt: new Date("2027-05-15T00:00:00Z"),
  paidCents: 0,
  totalCents: 150_000,
  ...over,
});

describe("booking transitions", () => {
  it("walks the happy path from inquiry to settled", () => {
    expect(transition("inquiry", "send_quote", "agency", ctx())).toEqual({ ok: true, to: "quoted" });
    expect(transition("quoted", "accept_quote", "customer", ctx())).toEqual({ ok: true, to: "booked" });
    expect(transition("booked", "artist_accepted", "artist", ctx())).toEqual({ ok: true, to: "confirmed" });
    const eventDay = ctx({ today: "2027-06-12" });
    expect(transition("confirmed", "complete", "agency", eventDay)).toEqual({ ok: true, to: "completed" });
    expect(transition("completed", "settle", "agency", ctx({ paidCents: 150_000 }))).toEqual({ ok: true, to: "settled" });
  });

  it("lets the agency send a revised quote and revive an expired one", () => {
    expect(transition("quoted", "send_quote", "agency", ctx())).toEqual({ ok: true, to: "quoted" });
    expect(transition("expired", "send_quote", "agency", ctx())).toEqual({ ok: true, to: "quoted" });
    expect(transition("booked", "send_quote", "agency", ctx())).toEqual({ ok: false, error: "invalid_status" });
  });

  it("refuses an expired quote and expires only after the deadline", () => {
    const late = ctx({ now: new Date("2027-05-20T00:00:00Z") });
    expect(transition("quoted", "accept_quote", "customer", late)).toEqual({ ok: false, error: "quote_expired" });
    expect(transition("quoted", "expire", "system", ctx())).toEqual({ ok: false, error: "quote_still_valid" });
    expect(transition("quoted", "expire", "system", late)).toEqual({ ok: true, to: "expired" });
  });

  it("checks who may act", () => {
    expect(transition("inquiry", "send_quote", "customer", ctx())).toEqual({ ok: false, error: "not_allowed" });
    expect(transition("booked", "artist_accepted", "agency", ctx())).toEqual({ ok: false, error: "not_allowed" });
    expect(transition("quoted", "expire", "agency", ctx())).toEqual({ ok: false, error: "not_allowed" });
    expect(transition("completed", "settle", "customer", ctx({ paidCents: 150_000 }))).toEqual({
      ok: false,
      error: "not_allowed",
    });
  });

  it("only completes on or after the event date", () => {
    expect(transition("confirmed", "complete", "artist", ctx())).toEqual({ ok: false, error: "event_not_reached" });
    expect(transition("confirmed", "complete", "artist", ctx({ eventDate: null }))).toEqual({
      ok: false,
      error: "no_event_date",
    });
    expect(transition("confirmed", "complete", "artist", ctx({ today: "2027-06-13" }))).toEqual({
      ok: true,
      to: "completed",
    });
  });

  it("settles only when fully paid", () => {
    expect(transition("completed", "settle", "agency", ctx({ paidCents: 149_999 }))).toEqual({
      ok: false,
      error: "not_fully_paid",
    });
  });

  it("lets customers cancel only before the event, and the agency always", () => {
    const after = ctx({ today: "2027-06-13" });
    expect(transition("confirmed", "cancel", "customer", ctx())).toEqual({ ok: true, to: "cancelled" });
    expect(transition("confirmed", "cancel", "customer", after)).toEqual({ ok: false, error: "event_passed" });
    expect(transition("confirmed", "cancel", "agency", after)).toEqual({ ok: true, to: "cancelled" });
    expect(transition("completed", "cancel", "agency", ctx())).toEqual({ ok: false, error: "invalid_status" });
  });

  it("never leaves a final status", () => {
    for (const status of ["settled", "declined", "cancelled"] as const) {
      for (const actor of ["agency", "artist", "customer", "system"] as const) {
        expect(availableActions(status, actor, ctx({ paidCents: 150_000, today: "2027-07-01" }))).toEqual([]);
      }
    }
  });

  it("has a rule for every action and only targets known statuses", () => {
    for (const status of bookingStatuses) {
      for (const action of bookingActions) {
        const result = transition(status, action, "agency", ctx());
        if (result.ok) expect(bookingStatuses).toContain(result.to);
      }
    }
  });

  it("lists the buttons each actor should see", () => {
    expect(availableActions("inquiry", "agency", ctx())).toEqual(["send_quote", "decline", "cancel"]);
    expect(availableActions("quoted", "customer", ctx())).toEqual(["accept_quote", "cancel"]);
    expect(availableActions("booked", "artist", ctx())).toEqual(["artist_accepted"]);
  });
});

describe("booking helpers", () => {
  it("reports payment progress", () => {
    expect(paymentStatus(0, 150_000, 45_000)).toBe("unpaid");
    expect(paymentStatus(10_000, 150_000, 45_000)).toBe("partially_paid");
    expect(paymentStatus(45_000, 150_000, 45_000)).toBe("deposit_paid");
    expect(paymentStatus(150_000, 150_000, 45_000)).toBe("paid");
  });

  it("uses the Dutch date, not the server's", () => {
    // 23:30 UTC on 31 Dec is already New Year in Amsterdam.
    expect(todayInNetherlands(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
  });

  it("tells whether an event date and start time have passed in the Netherlands", () => {
    // 13:30 UTC is 14:30 in Amsterdam (winter time).
    const now = new Date("2026-11-10T13:30:00Z");
    expect(timeInNetherlands(now)).toBe("14:30");
    expect(isPastInNetherlands("2026-11-09", null, now)).toBe(true);
    expect(isPastInNetherlands("2026-11-09", "23:00", now)).toBe(true);
    expect(isPastInNetherlands("2026-11-10", null, now)).toBe(false);
    expect(isPastInNetherlands("2026-11-10", "14:00", now)).toBe(true);
    expect(isPastInNetherlands("2026-11-10", "14:30", now)).toBe(false);
    expect(isPastInNetherlands("2026-11-10", "20:00", now)).toBe(false);
    expect(isPastInNetherlands("2026-11-11", "09:00", now)).toBe(false);
  });

  it("makes readable tracking codes", () => {
    const code = generateTrackingCode();
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(generateTrackingCode(() => new Uint8Array(8))).toBe("AAAAAAAA");
  });

  it("formats invoice numbers per year", () => {
    expect(formatInvoiceNumber(2027, 42)).toBe("2027-0042");
  });
});
