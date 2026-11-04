/**
 * What an assignment means to the artist. Every artist page classifies through
 * this one function, so the dashboard and the Gigs page can't disagree about
 * whether a request exists. A missing event date never hides a request.
 */
export const gigStates = ["new_request", "pending_response", "accepted", "date_pending", "completed", "past", "declined", "withdrawn", "cancelled"] as const;
export type GigState = (typeof gigStates)[number];

/** A request stays "new" this long, then it's simply waiting for an answer. */
export const newRequestHours = 48;

const cancelledBookings = ["cancelled", "declined", "expired"];
const finishedBookings = ["completed", "settled"];

export interface GigInput {
  assignmentStatus: string;
  bookingStatus: string;
  /** YYYY-MM-DD, or null while the date isn't scheduled. */
  eventDate: string | null;
  createdAt: Date;
}

export function gigState(gig: GigInput, today: string, now = new Date()): GigState {
  if (gig.assignmentStatus === "declined") return "declined";
  const bookingOff = cancelledBookings.includes(gig.bookingStatus);
  if (gig.assignmentStatus === "withdrawn") return bookingOff ? "cancelled" : "withdrawn";
  if (bookingOff) return "cancelled";
  if (gig.assignmentStatus === "pending") {
    // Nobody can answer for a booking that's over; it's history rather than an open request.
    if (finishedBookings.includes(gig.bookingStatus)) return "past";
    return now.getTime() - gig.createdAt.getTime() < newRequestHours * 3_600_000 ? "new_request" : "pending_response";
  }
  if (finishedBookings.includes(gig.bookingStatus)) return "completed";
  if (gig.eventDate === null) return "date_pending";
  return gig.eventDate < today ? "past" : "accepted";
}

/** Waiting for the artist's answer. */
export const isOpenGigRequest = (state: GigState) => state === "new_request" || state === "pending_response";
/** On the artist's agenda: accepted, with or without a date. */
export const isUpcomingGig = (state: GigState) => state === "accepted" || state === "date_pending";
/** Over, one way or another; shown as history. */
export const isClosedGig = (state: GigState) => state === "declined" || state === "withdrawn" || state === "cancelled";
