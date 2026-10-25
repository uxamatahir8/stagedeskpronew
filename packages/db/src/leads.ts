import { randomBytes, randomUUID } from "node:crypto";
import { generateTrackingCode, isBudgetRange, type EventType, type QuoteLineInput } from "@stagedesk/core";
import { createBooking, resolveBookingCustomer, toDateOnly } from "./bookings";
import { prisma } from "./client";
import type { Prisma } from "./generated/prisma/client";

export class LeadError extends Error {
  constructor(readonly code: "not_found" | "taken" | "closed" | "agency_suspended" | "not_offered" | "customer_on_team") {
    super(`Lead: ${code}`);
    this.name = "LeadError";
  }
}

export const leadStatuses = ["new", "offered", "assigned", "closed"] as const;
export type LeadStatus = (typeof leadStatuses)[number];

export interface LeadInput {
  name: string;
  email: string;
  phone: string | null;
  locale: "nl" | "en";
  eventType: EventType;
  eventDate: string | null;
  startTime: string | null;
  venueName: string | null;
  venueCity: string | null;
  guestCount: number | null;
  budgetRange: string | null;
  preferredGenre: string | null;
  partnerName: string | null;
  ceremony: boolean | null;
  message: string | null;
}

/** A request from the public form. The reference is what the customer sees. */
export async function submitLead(input: LeadInput) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = `L-${generateTrackingCode().slice(0, 6)}`;
    if (await prisma.lead.findUnique({ where: { reference }, select: { id: true } })) continue;
    const wedding = input.eventType === "wedding";
    return prisma.lead.create({
      data: {
        id: randomUUID(),
        reference,
        accessToken: randomBytes(24).toString("base64url"),
        ...input,
        email: input.email.trim().toLowerCase(),
        eventDate: input.eventDate ? toDateOnly(input.eventDate) : null,
        budgetRange: isBudgetRange(input.budgetRange) ? input.budgetRange : null,
        partnerName: wedding ? input.partnerName : null,
        ceremony: wedding ? input.ceremony : null,
      },
    });
  }
  throw new Error("Could not find a free lead reference");
}

/** The admin's lead queue: deliberately platform-wide. */
export async function listLeads({
  q = "",
  status = null,
  page = 1,
  pageSize = 25,
  sort = "created",
  dir = "desc",
}: {
  q?: string;
  status?: LeadStatus | null;
  page?: number;
  pageSize?: number;
  sort?: "created" | "date" | "name";
  dir?: "asc" | "desc";
}) {
  const search = q.trim();
  const where: Prisma.LeadWhereInput = {
    ...(status ? { status } : {}),
    ...(search
      ? { OR: [{ reference: { contains: search.toUpperCase() } }, { name: { contains: search } }, { email: { contains: search } }, { venueCity: { contains: search } }] }
      : {}),
  };
  const [rows, total, counts] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: sort === "date" ? [{ eventDate: { sort: dir, nulls: "last" } }, { createdAt: "desc" }] : sort === "name" ? [{ name: dir }] : [{ createdAt: dir }],
      skip: (Math.max(1, page) - 1) * pageSize,
      take: pageSize,
      include: {
        assignedAgency: { select: { id: true, name: true } },
        offers: { select: { status: true, agency: { select: { name: true } } } },
      },
    }),
    prisma.lead.count({ where }),
    prisma.lead.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Partial<Record<LeadStatus, number>>;
  return { rows, total, pages: Math.max(1, Math.ceil(total / pageSize)), byStatus };
}

export async function leadDetail(id: string) {
  return prisma.lead.findUnique({
    where: { id },
    include: {
      assignedAgency: { select: { id: true, name: true } },
      offers: { orderBy: { createdAt: "asc" }, include: { agency: { select: { id: true, name: true, city: true } } } },
    },
  });
}

const open = (status: string) => status === "new" || status === "offered";

/** Offers the lead to agencies; offering again to the same agency is a no-op. Returns the agencies newly offered. */
export async function offerLead(leadId: string, agencyIds: string[]) {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { status: true } });
  if (!lead) throw new LeadError("not_found");
  if (!open(lead.status)) throw new LeadError(lead.status === "assigned" ? "taken" : "closed");
  const agencies = await prisma.organization.findMany({ where: { id: { in: agencyIds }, suspendedAt: null }, select: { id: true } });
  const existing = await prisma.leadOffer.findMany({ where: { leadId, agencyId: { in: agencies.map((a) => a.id) } }, select: { agencyId: true } });
  const fresh = agencies.map((a) => a.id).filter((id) => !existing.some((e) => e.agencyId === id));
  await prisma.$transaction([
    prisma.leadOffer.createMany({ data: fresh.map((agencyId) => ({ id: randomUUID(), leadId, agencyId })) }),
    prisma.lead.update({ where: { id: leadId }, data: { status: "offered" } }),
  ]);
  return fresh;
}

/**
 * Gives the lead to one agency: it becomes a booking there (source "lead") and
 * the customer an agency customer. Claimed with a conditional update first, so
 * two agencies accepting at the same moment can't both get it.
 */
export async function assignLead(leadId: string, agencyId: string, actorId: string | null) {
  const agency = await prisma.organization.findUnique({ where: { id: agencyId }, select: { id: true, name: true, suspendedAt: true } });
  if (!agency) throw new LeadError("not_found");
  if (agency.suspendedAt) throw new LeadError("agency_suspended");
  const claimed = await prisma.lead.updateMany({ where: { id: leadId, status: { in: ["new", "offered"] } }, data: { status: "assigned", assignedAgencyId: agencyId } });
  if (claimed.count === 0) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { status: true } });
    throw new LeadError(!lead ? "not_found" : lead.status === "closed" ? "closed" : "taken");
  }
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  try {
    const customerId = await resolveBookingCustomer(agencyId, { mode: "new", name: lead.name, email: lead.email, phone: lead.phone });
    if (!customerId) throw new LeadError("customer_on_team");
    const booking = await createBooking(
      agencyId,
      {
        customerId,
        eventType: lead.eventType as EventType,
        eventDate: lead.eventDate ? lead.eventDate.toISOString().slice(0, 10) : null,
        startTime: lead.startTime,
        venueName: lead.venueName,
        venueCity: lead.venueCity,
        guestCount: lead.guestCount,
        message: lead.message,
        partnerName: lead.partnerName,
        ceremony: lead.ceremony,
        preferredGenre: lead.preferredGenre,
        budgetRange: lead.budgetRange,
        source: "lead",
      },
      actorId,
    );
    await prisma.$transaction([
      prisma.lead.update({ where: { id: leadId }, data: { bookingId: booking.id } }),
      prisma.leadOffer.updateMany({ where: { leadId, agencyId, status: "pending" }, data: { status: "accepted", respondedById: actorId, respondedAt: new Date() } }),
      prisma.leadOffer.updateMany({ where: { leadId, agencyId: { not: agencyId }, status: "pending" }, data: { status: "withdrawn" } }),
    ]);
    return { lead, booking, agency };
  } catch (error) {
    // Put the lead back so it can go to someone else.
    await prisma.lead.update({ where: { id: leadId }, data: { status: "offered", assignedAgencyId: null } });
    throw error;
  }
}

/** An agency's answer to an offer. Accepting assigns the lead to them. */
export async function respondToLeadOffer(leadId: string, agencyId: string, accept: boolean, userId: string) {
  const offer = await prisma.leadOffer.findUnique({ where: { leadId_agencyId: { leadId, agencyId } } });
  if (!offer || offer.status !== "pending") throw new LeadError("not_offered");
  if (accept) return { accepted: true as const, ...(await assignLead(leadId, agencyId, userId)) };
  await prisma.leadOffer.update({ where: { id: offer.id }, data: { status: "declined", respondedById: userId, respondedAt: new Date() } });
  return { accepted: false as const };
}

export async function closeLead(leadId: string, reason: string | null) {
  const closed = await prisma.lead.updateMany({ where: { id: leadId, status: { in: ["new", "offered"] } }, data: { status: "closed", closedReason: reason?.slice(0, 191) || null } });
  if (closed.count === 0) throw new LeadError("taken");
  await prisma.leadOffer.updateMany({ where: { leadId, status: "pending" }, data: { status: "withdrawn" } });
}

export async function saveLeadNotes(leadId: string, notes: string | null) {
  return prisma.lead.update({ where: { id: leadId }, data: { adminNotes: notes?.slice(0, 5000) || null } });
}

/**
 * What an agency sees of its open offers. Contact details stay hidden until
 * the agency accepts; then the lead is a booking with a customer like any other.
 */
export async function agencyLeadOffers(agencyId: string) {
  const offers = await prisma.leadOffer.findMany({
    where: { agencyId, status: { in: ["pending", "quoted"] }, lead: { status: { in: ["new", "offered"] } } },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      status: true,
      source: true,
      quoteLines: true,
      depositBps: true,
      totalCents: true,
      currency: true,
      quoteMessage: true,
      validUntil: true,
      lead: {
        select: {
          id: true,
          reference: true,
          eventType: true,
          eventDate: true,
          startTime: true,
          venueCity: true,
          guestCount: true,
          budgetRange: true,
          preferredGenre: true,
          message: true,
          _count: { select: { offers: true } },
          offers: { where: { status: { in: ["quoted", "accepted"] } }, select: { id: true } },
        },
      },
    },
  });
  // Others' prices stay private; only how many have been sent is shown.
  return offers.map(({ lead: { offers: quoted, _count, ...lead }, ...o }) => ({
    ...lead,
    offeredAt: o.createdAt,
    offeredTo: _count.offers,
    quotesSent: quoted.length,
    offer: {
      status: o.status,
      source: o.source,
      lines: (o.quoteLines ?? []) as unknown as QuoteLineInput[],
      depositBps: o.depositBps,
      totalCents: o.totalCents,
      currency: o.currency,
      message: o.quoteMessage,
      validUntil: o.validUntil,
    },
  }));
}
