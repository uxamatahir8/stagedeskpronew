import { todayInNetherlands } from "@stagedesk/core";
import { prisma } from "./client";
import { getSetting } from "./settings";

const dateOnly = (iso: string, plusDays = 0) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + plusDays);
  return d;
};

const person = { select: { id: true, name: true, email: true, locale: true } } as const;
const bookingInclude = {
  customer: person,
  organization: { select: { name: true } },
  assignments: { where: { status: "accepted" }, take: 1, select: { artist: { select: { stageName: true, user: person } } } },
} as const;

/**
 * Claims a reminder so it's sent at most once, even if the job runs twice or
 * two workers race. Returns false when it was already sent.
 */
export async function claimReminder(key: string) {
  try {
    await prisma.reminderLog.create({ data: { key } });
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return false;
    throw error;
  }
}

/** Bookings whose event is exactly `days` days away (Dutch date). */
export function eventsInDays(days: number, now = new Date()) {
  return prisma.booking.findMany({
    where: { status: { in: ["booked", "confirmed"] }, eventDate: dateOnly(todayInNetherlands(now), days) },
    include: bookingInclude,
  });
}

/** Quotes that expire within the next `hours` hours. */
export function quotesExpiringWithin(hours: number, now = new Date()) {
  return prisma.booking.findMany({
    where: { status: "quoted", quoteExpiresAt: { gt: now, lte: new Date(now.getTime() + hours * 3_600_000) } },
    include: { ...bookingInclude, quotes: { where: { status: "sent" }, orderBy: { version: "desc" }, take: 1, select: { id: true, token: true, expiresAt: true } } },
  });
}

/** Bookings with money open on the balance-due day (the setting's days before the event), or later. */
export async function balancesDue(now = new Date()) {
  const { balanceDueDaysBeforeEvent } = await getSetting("bookings.defaults");
  const today = todayInNetherlands(now);
  const bookings = await prisma.booking.findMany({
    where: {
      status: { in: ["booked", "confirmed"] },
      eventDate: { gte: dateOnly(today), lte: dateOnly(today, balanceDueDaysBeforeEvent) },
      totalCents: { gt: 0 },
    },
    include: bookingInclude,
  });
  return bookings.filter((b) => b.paidCents < b.totalCents);
}
