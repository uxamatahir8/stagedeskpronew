"use server";

import { randomUUID } from "node:crypto";
import { getTranslations } from "next-intl/server";
import { prisma } from "@stagedesk/db";
import type { ActionResult } from "@/lib/actions";
import { requireAgency } from "@/lib/viewer";

/** A customer reviews their own completed booking, once. */
export async function submitReviewAction(bookingId: string, rating: number, comment: string): Promise<ActionResult> {
  const { viewer, organization, db } = await requireAgency("customer.event");
  const t = await getTranslations("customerEvent");
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false };

  const booking = await db.booking.findFirst({
    where: { id: bookingId, customerId: viewer.user.id, status: { in: ["completed", "settled"] }, review: null },
    include: { assignments: { where: { status: "accepted" }, select: { artistId: true }, take: 1 } },
  });
  if (!booking) return { ok: false, message: (await getTranslations("bookingErrors"))("invalid_status") };

  await prisma.$transaction([
    prisma.review.create({
      data: {
        id: randomUUID(),
        organizationId: organization.id,
        bookingId,
        customerId: viewer.user.id,
        artistId: booking.assignments[0]?.artistId ?? null,
        rating,
        comment: comment.trim().slice(0, 5000) || null,
      },
    }),
    prisma.bookingEvent.create({ data: { organizationId: organization.id, bookingId, type: "review_posted", actorId: viewer.user.id } }),
  ]);
  return { ok: true, message: t("reviewThanks") };
}

export async function moderateReviewAction(reviewId: string, approve: boolean): Promise<ActionResult> {
  const { db } = await requireAgency("agency.bookings");
  await db.review.updateMany({ where: { id: reviewId }, data: { status: approve ? "approved" : "rejected", moderatedAt: new Date() } });
  return { ok: true, message: (await getTranslations("reviews"))("updated") };
}
