import { randomUUID } from "node:crypto";
import { recordPayment, toDateOnly } from "./bookings";
import { prisma } from "./client";
import { tenantDb } from "./tenant";

/**
 * Payments made outside Stripe. The customer reports a bank transfer or cash
 * payment (a claim); the agency confirms it once the money is in, which
 * records the Payment like any offline payment, or marks it not received.
 */
export class PaymentClaimError extends Error {
  constructor(readonly code: "not_found" | "not_payable" | "invalid_amount" | "too_much" | "already_reviewed" | "open_claim") {
    super(`Payment claim: ${code}`);
    this.name = "PaymentClaimError";
  }
}

export interface ClaimInput {
  method: "bank_transfer" | "cash";
  amountCents: number;
  /** YYYY-MM-DD */
  paidOn: string;
  reference: string | null;
  note: string | null;
}

/** What's still open on a booking once payments and claims waiting for review are counted. */
export async function outstandingCents(organizationId: string, bookingId: string) {
  const db = tenantDb(organizationId);
  const [booking, pending] = await Promise.all([
    db.booking.findFirst({ where: { id: bookingId }, select: { totalCents: true, paidCents: true } }),
    db.paymentClaim.aggregate({ where: { bookingId, status: "pending" }, _sum: { amountCents: true } }),
  ]);
  if (!booking) return 0;
  return Math.max(0, booking.totalCents - booking.paidCents - (pending._sum.amountCents ?? 0));
}

export async function submitPaymentClaim(organizationId: string, bookingId: string, customerId: string, input: ClaimInput) {
  const db = tenantDb(organizationId);
  const booking = await db.booking.findFirst({ where: { id: bookingId, customerId }, select: { id: true, status: true, depositCents: true, paidCents: true } });
  if (!booking) throw new PaymentClaimError("not_found");
  if (!["booked", "confirmed", "completed"].includes(booking.status)) throw new PaymentClaimError("not_payable");
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new PaymentClaimError("invalid_amount");
  if (await db.paymentClaim.count({ where: { bookingId, status: "pending" } })) throw new PaymentClaimError("open_claim");
  if (input.amountCents > (await outstandingCents(organizationId, bookingId))) throw new PaymentClaimError("too_much");
  return db.paymentClaim.create({
    data: {
      id: randomUUID(),
      organizationId,
      bookingId,
      customerId,
      method: input.method,
      kind: booking.paidCents < booking.depositCents ? "deposit" : "balance",
      amountCents: input.amountCents,
      paidOn: toDateOnly(input.paidOn),
      reference: input.reference?.slice(0, 191) || null,
      note: input.note?.slice(0, 2000) || null,
    },
  });
}

/**
 * The agency saw the money arrive. Claimed with a conditional update first, so
 * a double click or two colleagues can't record the payment twice.
 */
export async function confirmPaymentClaim(organizationId: string, claimId: string, actorId: string, receivedOn?: string) {
  const db = tenantDb(organizationId);
  const claimed = await db.paymentClaim.updateMany({ where: { id: claimId, status: "pending" }, data: { status: "confirmed", reviewedById: actorId, reviewedAt: new Date() } });
  if (claimed.count === 0) throw new PaymentClaimError((await db.paymentClaim.count({ where: { id: claimId } })) ? "already_reviewed" : "not_found");
  const claim = await db.paymentClaim.findFirstOrThrow({ where: { id: claimId } });
  try {
    const payment = await recordPayment(
      organizationId,
      claim.bookingId,
      {
        amountCents: claim.amountCents,
        kind: claim.kind as "deposit" | "balance" | "other",
        method: claim.method as "bank_transfer" | "cash",
        receivedAt: receivedOn ? toDateOnly(receivedOn) : claim.paidOn,
        reference: claim.reference,
      },
      actorId,
    );
    await db.paymentClaim.updateMany({ where: { id: claimId }, data: { paymentId: payment.id } });
    return { claim, payment };
  } catch (error) {
    await db.paymentClaim.updateMany({ where: { id: claimId }, data: { status: "pending", reviewedById: null, reviewedAt: null } });
    throw error;
  }
}

/** The money didn't arrive (or not this amount): the customer is told why and can report again. */
export async function rejectPaymentClaim(organizationId: string, claimId: string, actorId: string, reason: string) {
  const db = tenantDb(organizationId);
  const rejected = await db.paymentClaim.updateMany({
    where: { id: claimId, status: "pending" },
    data: { status: "rejected", reviewedById: actorId, reviewedAt: new Date(), rejectReason: reason.trim().slice(0, 191) || null },
  });
  if (rejected.count === 0) throw new PaymentClaimError((await db.paymentClaim.count({ where: { id: claimId } })) ? "already_reviewed" : "not_found");
  return db.paymentClaim.findFirstOrThrow({ where: { id: claimId } });
}

/** Claims the agency still has to look at, oldest first. */
export async function pendingPaymentClaims(organizationId: string) {
  return tenantDb(organizationId).paymentClaim.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    include: { booking: { select: { trackingCode: true, eventType: true, eventDate: true, customer: { select: { name: true, email: true } } } } },
  });
}

export async function bookingPaymentClaims(organizationId: string, bookingId: string) {
  return tenantDb(organizationId).paymentClaim.findMany({ where: { bookingId }, orderBy: { createdAt: "desc" } });
}

/** For the customer's own view of a booking (claims carry the agency id, read through prisma by booking). */
export async function customerPaymentClaims(bookingId: string, customerId: string) {
  return prisma.paymentClaim.findMany({ where: { bookingId, customerId }, orderBy: { createdAt: "desc" } });
}
