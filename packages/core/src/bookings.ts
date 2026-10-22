/**
 * Booking lifecycle from the build plan. Phase 3 adds the transition rules;
 * the status list lives here now so the UI and database share one source.
 */
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
