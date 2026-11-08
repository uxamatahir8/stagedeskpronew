import { artistShareOfReceived, compensationOf } from "@stagedesk/core";
import { prisma } from "./client";
import { BookingError, loadBookingForSettlement } from "./bookings";

/** What an agency pays an artist itself for one booking, once the event is done. */
export interface ArtistBalance {
  artistId: string;
  stageName: string;
  /** Their part of money the agency received itself (bank transfer, cash). */
  offlineShareCents: number;
  /** Their part of online payments the agency received because they had no Stripe payouts. */
  owedFromStripeCents: number;
  paidByAgencyCents: number;
  dueCents: number;
}

/** Ledger type for "the agency paid the artist itself"; rows are append-only, like all money movements. */
export const ARTIST_PAID_BY_AGENCY = "artist_paid_by_agency";

const doneStatuses = ["completed", "settled"];

/**
 * The balance on a booking with its accepted artist, or null when there's no
 * accepted artist. Only finished events have anything due: until then a deposit
 * can still be refunded and the artist hasn't performed.
 */
export async function artistBalanceOnBooking(organizationId: string, bookingId: string, db: Pick<typeof prisma, "bookingAssignment" | "payment" | "ledgerEntry" | "booking"> = prisma): Promise<ArtistBalance | null> {
  const booking = await db.booking.findFirst({ where: { id: bookingId, organizationId }, select: { status: true, totalCents: true } });
  if (!booking) return null;
  const assignment = await db.bookingAssignment.findFirst({
    where: { bookingId, status: "accepted" },
    include: { artist: { select: { id: true, stageName: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (!assignment) return null;
  const [payments, ledger] = await Promise.all([
    db.payment.findMany({ where: { bookingId, kind: { not: "refund" }, method: { not: "stripe" } }, select: { amountCents: true, refundedCents: true } }),
    db.ledgerEntry.findMany({ where: { bookingId, artistId: assignment.artistId, type: { in: ["owed_by_agency", ARTIST_PAID_BY_AGENCY] } }, select: { type: true, amountCents: true } }),
  ]);
  const received = payments.reduce((sum, p) => sum + p.amountCents - p.refundedCents, 0);
  const sum = (type: string) => ledger.filter((l) => l.type === type).reduce((s, l) => s + l.amountCents, 0);
  const offlineShareCents = artistShareOfReceived(compensationOf(assignment), received, booking.totalCents);
  const owedFromStripeCents = sum("owed_by_agency");
  const paidByAgencyCents = sum(ARTIST_PAID_BY_AGENCY);
  const dueCents = doneStatuses.includes(booking.status) ? Math.max(0, offlineShareCents + owedFromStripeCents - paidByAgencyCents) : 0;
  return { artistId: assignment.artistId, stageName: assignment.artist.stageName, offlineShareCents, owedFromStripeCents, paidByAgencyCents, dueCents };
}

/** The agency says it paid the artist what's due. Worked out here, under the booking lock, so a double click pays once. */
export async function markArtistPaid(organizationId: string, bookingId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    await loadBookingForSettlement(tx, organizationId, bookingId);
    const balance = await artistBalanceOnBooking(organizationId, bookingId, tx as never);
    if (!balance || balance.dueCents <= 0) throw new BookingError("nothing_due");
    await tx.ledgerEntry.create({
      data: { organizationId, bookingId, type: ARTIST_PAID_BY_AGENCY, party: "artist", amountCents: balance.dueCents, artistId: balance.artistId },
    });
    await tx.bookingEvent.create({ data: { organizationId, bookingId, type: "artist_paid", actorId, data: { amountCents: balance.dueCents, artistId: balance.artistId, stageName: balance.stageName } } });
    return balance;
  });
}
