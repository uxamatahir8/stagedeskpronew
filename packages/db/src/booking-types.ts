import { randomUUID } from "node:crypto";
import { prisma } from "./client";

export class BookingTypeError extends Error {
  constructor(readonly code: "invalid" | "not_found" | "key_taken" | "protected" | "in_use" | "not_allowed") {
    super(`Booking type: ${code}`);
    this.name = "BookingTypeError";
  }
}

export interface BookingTypeInput {
  key: string;
  nameNl: string;
  nameEn: string;
  active: boolean;
  position?: number;
}

const keyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function clean(input: BookingTypeInput) {
  const key = input.key.trim().toLowerCase();
  const nameNl = input.nameNl.trim();
  const nameEn = input.nameEn.trim();
  if (!keyPattern.test(key) || key.length > 64 || !nameNl || !nameEn || nameNl.length > 80 || nameEn.length > 80) {
    throw new BookingTypeError("invalid");
  }
  return { key, nameNl, nameEn, active: Boolean(input.active), position: Math.max(0, Math.min(9999, Math.trunc(input.position ?? 0))) };
}

/** Active platform types plus the active custom types belonging to one business. */
export async function availableBookingTypes(organizationId?: string | null, includeInactive = false) {
  return prisma.bookingType.findMany({
    where: {
      OR: [{ organizationId: null }, ...(organizationId ? [{ organizationId }] : [])],
      ...(includeInactive ? {} : { active: true }),
    },
    orderBy: [{ organizationId: "asc" }, { position: "asc" }, { nameEn: "asc" }],
  });
}

export async function bookingTypeExists(key: string, organizationId?: string | null) {
  return Boolean(await prisma.bookingType.findFirst({
    where: { key, active: true, OR: [{ organizationId: null }, ...(organizationId ? [{ organizationId }] : [])] },
    select: { id: true },
  }));
}

/** Localized name for UI/email rendering, including inactive historical types. */
export async function bookingTypeName(key: string, locale: "nl" | "en", organizationId?: string | null) {
  const row = await prisma.bookingType.findFirst({
    where: { key, OR: [...(organizationId ? [{ organizationId }] : []), { organizationId: null }] },
    orderBy: { organizationId: "desc" },
    select: { nameNl: true, nameEn: true },
  });
  return row ? (locale === "nl" ? row.nameNl : row.nameEn) : key;
}

/** Agencies and solo artists may create and update only their own types. */
export async function saveOrganizationBookingType(organizationId: string, actorId: string, id: string | null, input: BookingTypeInput) {
  const data = clean(input);
  const existing = id ? await prisma.bookingType.findFirst({ where: { id, organizationId }, select: { id: true, key: true, protected: true } }) : null;
  if (id && !existing) throw new BookingTypeError("not_found");
  const saved = existing ? { ...data, key: existing.key } : data;
  const platformClash = await prisma.bookingType.findFirst({ where: { key: saved.key, organizationId: null }, select: { id: true } });
  if (platformClash) throw new BookingTypeError("key_taken");
  const clash = await prisma.bookingType.findFirst({ where: { key: saved.key, organizationId, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
  if (clash) throw new BookingTypeError("key_taken");
  if (!id) return prisma.bookingType.create({ data: { id: randomUUID(), organizationId, createdById: actorId, ...saved } });
  if (!existing) throw new BookingTypeError("not_found");
  if (existing.protected) throw new BookingTypeError("protected");
  return prisma.bookingType.update({ where: { id }, data: saved });
}

/** Platform admins manage the shared catalog. Wedding stays active and keeps its key. */
export async function savePlatformBookingType(actorId: string, id: string | null, input: BookingTypeInput) {
  const data = clean(input);
  const existing = id ? await prisma.bookingType.findFirst({ where: { id, organizationId: null }, select: { id: true, key: true, protected: true } }) : null;
  if (id && !existing) throw new BookingTypeError("not_found");
  const saved = existing ? { ...data, key: existing.key } : data;
  const clash = await prisma.bookingType.findFirst({ where: { key: saved.key, organizationId: null, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
  if (clash) throw new BookingTypeError("key_taken");
  if (!id) return prisma.bookingType.create({ data: { id: randomUUID(), organizationId: null, createdById: actorId, ...saved } });
  if (!existing) throw new BookingTypeError("not_found");
  return prisma.bookingType.update({
    where: { id },
    data: existing.protected ? { nameNl: saved.nameNl, nameEn: saved.nameEn, position: saved.position, active: true } : saved,
  });
}

async function bookingTypeUsage(key: string) {
  const [bookings, leads, listings, agencies] = await Promise.all([
    prisma.booking.count({ where: { eventType: key } }),
    prisma.lead.count({ where: { eventType: key } }),
    prisma.gigListing.findMany({ where: { eventTypes: { not: undefined } }, select: { eventTypes: true } }),
    prisma.organization.findMany({ where: { serviceEventTypes: { not: undefined } }, select: { serviceEventTypes: true } }),
  ]);
  const inJson = [...listings.map((x) => x.eventTypes), ...agencies.map((x) => x.serviceEventTypes)]
    .some((value) => Array.isArray(value) && value.includes(key));
  return bookings + leads > 0 || inJson;
}

/** Only platform admins call this. Tenant types intentionally have no delete operation. */
export async function deletePlatformBookingType(id: string) {
  const row = await prisma.bookingType.findFirst({ where: { id, organizationId: null }, select: { id: true, key: true, protected: true } });
  if (!row) throw new BookingTypeError("not_found");
  if (row.protected || row.key === "wedding") throw new BookingTypeError("protected");
  if (await bookingTypeUsage(row.key)) throw new BookingTypeError("in_use");
  await prisma.bookingType.delete({ where: { id } });
}
