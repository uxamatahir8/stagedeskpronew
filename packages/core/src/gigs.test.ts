import { describe, expect, it } from "vitest";
import { gigState, isClosedGig, isOpenGigRequest, isUpcomingGig } from "./gigs";

const now = new Date("2027-05-10T12:00:00Z");
const today = "2027-05-10";
const gig = (assignmentStatus: string, bookingStatus: string, eventDate: string | null, createdAt = new Date("2027-05-10T08:00:00Z")) => ({ assignmentStatus, bookingStatus, eventDate, createdAt });

describe("gigState", () => {
  it("keeps an unanswered request open whether or not the event has a date", () => {
    expect(gigState(gig("pending", "booked", "2027-06-01"), today, now)).toBe("new_request");
    expect(gigState(gig("pending", "booked", null), today, now)).toBe("new_request");
    expect(gigState(gig("pending", "confirmed", null), today, now)).toBe("new_request");
  });

  it("calls a request 'pending' once it's no longer new", () => {
    expect(gigState(gig("pending", "booked", "2027-06-01", new Date("2027-05-01T00:00:00Z")), today, now)).toBe("pending_response");
  });

  it("still shows a request whose event date has passed, so it can be answered or sorted out", () => {
    expect(isOpenGigRequest(gigState(gig("pending", "booked", "2027-05-01"), today, now))).toBe(true);
  });

  it("does not hide a pending assignment on a booking in an unusual status", () => {
    expect(isOpenGigRequest(gigState(gig("pending", "quoted", null), today, now))).toBe(true);
  });

  it("files an accepted gig without a date as date pending, never as past", () => {
    const state = gigState(gig("accepted", "booked", null), today, now);
    expect(state).toBe("date_pending");
    expect(isUpcomingGig(state)).toBe(true);
  });

  it("splits accepted gigs on the event date, today included as upcoming", () => {
    expect(gigState(gig("accepted", "confirmed", today), today, now)).toBe("accepted");
    expect(gigState(gig("accepted", "confirmed", "2027-05-09"), today, now)).toBe("past");
  });

  it("marks finished bookings completed", () => {
    expect(gigState(gig("accepted", "completed", "2027-05-01"), today, now)).toBe("completed");
    expect(gigState(gig("accepted", "settled", "2027-05-01"), today, now)).toBe("completed");
  });

  it("tells declined, withdrawn and cancelled apart", () => {
    expect(gigState(gig("declined", "booked", null), today, now)).toBe("declined");
    expect(gigState(gig("withdrawn", "booked", null), today, now)).toBe("withdrawn");
    expect(gigState(gig("withdrawn", "cancelled", null), today, now)).toBe("cancelled");
    expect(gigState(gig("accepted", "cancelled", "2027-06-01"), today, now)).toBe("cancelled");
    for (const state of ["declined", "withdrawn", "cancelled"] as const) expect(isClosedGig(state)).toBe(true);
  });
});
