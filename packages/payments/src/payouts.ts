import type Stripe from "stripe";
import { type FeeSnapshot, splitBookingPayment } from "@stagedesk/core";
import { changeBookingStatus, getSetting, prisma, tenantDb } from "@stagedesk/db";

/**
 * Splits a booking's Stripe payments and transfers the shares, once the event
 * is completed and the dispute window has passed. Uses the fee frozen on the
 * booking at acceptance. If the artist has no connected account, their share
 * goes to the agency and is recorded as owed to the artist.
 * Idempotent per payment (transferredAt and Stripe idempotency keys).
 */
export async function payoutBooking(stripe: Stripe, bookingId: string, now = new Date()) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      payments: { where: { method: "stripe", transferredAt: null } },
      assignments: { where: { status: "accepted" }, take: 1, include: { artist: { include: { connectedAccount: true } } } },
    },
  });
  if (!booking || booking.disputed || !booking.completedAt) return { transferred: 0 };
  const { payoutDisputeWindowDays } = await getSetting("bookings.defaults");
  if (booking.completedAt.getTime() + payoutDisputeWindowDays * 86_400_000 > now.getTime()) return { transferred: 0 };

  const db = tenantDb(booking.organizationId);
  const agencyAccount = await db.connectedAccount.findFirst({ where: { artistId: null, payoutsEnabled: true } });
  if (!agencyAccount) return { transferred: 0 };

  const snapshot = booking.feeSnapshot as unknown as FeeSnapshot | null;
  const fees = snapshot ?? { rule: (await getSetting("fees.platform")).defaultRule, stripeFeePaidBy: (await getSetting("fees.platform")).stripeFeePaidBy };
  const assignment = booking.assignments[0];
  const artistAccount = assignment?.artist.connectedAccount?.payoutsEnabled ? assignment.artist.connectedAccount : null;
  let transferred = 0;

  for (const payment of booking.payments) {
    const amount = payment.amountCents - payment.refundedCents;
    if (amount <= 0 || !payment.stripeChargeId) continue;
    const split = splitBookingPayment({
      amount,
      stripeFee: payment.stripeFeeCents,
      artistShareBps: assignment?.shareBps ?? 0,
      feeRule: fees.rule,
      stripeFeePaidBy: fees.stripeFeePaidBy,
    });
    const toArtist = artistAccount ? split.artist : 0;
    const toAgency = split.agency + (artistAccount ? 0 : split.artist);

    const transfer = async (destination: string, cents: number, party: string) =>
      cents > 0
        ? stripe.transfers.create(
            {
              amount: cents,
              currency: booking.currency.toLowerCase(),
              destination,
              transfer_group: booking.id,
              source_transaction: payment.stripeChargeId!,
              metadata: { bookingId: booking.id, paymentId: payment.id, party },
            },
            { idempotencyKey: `payout-${payment.id}-${party}` },
          )
        : null;
    const artistTransfer = artistAccount ? await transfer(artistAccount.stripeAccountId, toArtist, "artist") : null;
    const agencyTransfer = await transfer(agencyAccount.stripeAccountId, toAgency, "agency");

    const base = { organizationId: booking.organizationId, bookingId: booking.id, paymentId: payment.id };
    const artistId = assignment?.artistId ?? null;
    await prisma.$transaction([
      prisma.ledgerEntry.createMany({
        data: [
          { ...base, type: "platform_fee", party: "platform", amountCents: split.platform },
          ...(artistId ? [{ ...base, type: "artist_share", party: "artist", amountCents: split.artist, artistId }] : []),
          { ...base, type: "agency_share", party: "agency", amountCents: split.agency },
          ...(artistTransfer ? [{ ...base, type: "transfer", party: "artist", amountCents: toArtist, artistId, stripeObjectId: artistTransfer.id }] : []),
          ...(agencyTransfer ? [{ ...base, type: "transfer", party: "agency", amountCents: toAgency, stripeObjectId: agencyTransfer.id }] : []),
          ...(artistId && !artistAccount && split.artist > 0
            ? [{ ...base, type: "owed_by_agency", party: "artist", amountCents: split.artist, artistId }]
            : []),
        ],
      }),
      prisma.payment.update({ where: { id: payment.id }, data: { transferredAt: now } }),
    ]);
    transferred += toArtist + toAgency;
  }

  await prisma.booking.update({ where: { id: booking.id }, data: { paidOutAt: now } });
  // A fully paid, completed booking is now settled.
  const fresh = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id }, select: { status: true, paidCents: true, totalCents: true } });
  if (fresh.status === "completed" && fresh.paidCents >= fresh.totalCents) {
    await changeBookingStatus(booking.organizationId, booking.id, "settle", { actor: "system", actorId: null }, now);
  }
  return { transferred };
}

/** Pays out every booking whose dispute window has passed. Called by the worker. */
export async function runDuePayouts(stripe: Stripe, now = new Date()) {
  const { payoutDisputeWindowDays } = await getSetting("bookings.defaults");
  const due = await prisma.booking.findMany({
    where: {
      status: { in: ["completed", "settled"] },
      disputed: false,
      completedAt: { lte: new Date(now.getTime() - payoutDisputeWindowDays * 86_400_000) },
      payments: { some: { method: "stripe", transferredAt: null } },
    },
    select: { id: true },
  });
  let count = 0;
  for (const b of due) {
    if ((await payoutBooking(stripe, b.id, now)).transferred > 0) count++;
  }
  return count;
}
