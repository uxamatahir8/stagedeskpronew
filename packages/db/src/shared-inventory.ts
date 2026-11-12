import { prisma } from "./client";
import type { Prisma } from "./generated/prisma/client";

/**
 * Equipment other agencies chose to share, read-only. This is the only
 * cross-agency read of inventory: it uses the plain client with a fixed
 * filter (sharing on, agency not suspended, item not excluded or retired, not
 * the viewer's own) and a fixed field list. Serial numbers, notes, specs,
 * status, condition, quantities, bookings and history are never selected.
 * Nothing here is cached, so turning sharing off hides everything at once.
 */

/** The only fields another agency may see. */
export const sharedItemSelect = {
  id: true,
  code: true,
  name: true,
  kind: true,
  manufacturer: true,
  model: true,
  powerWatts: true,
  batteryPowered: true,
  category: { select: { name: true } },
  organization: { select: { id: true, name: true, city: true, slug: true, bookingPageEnabled: true } },
} as const satisfies Prisma.EquipmentItemSelect;

function sharedWhere(viewerOrganizationId: string): Prisma.EquipmentItemWhereInput {
  return {
    organizationId: { not: viewerOrganizationId },
    organization: { inventorySharing: true, suspendedAt: null },
    excludeFromSharing: false,
    status: { not: "retired" },
    // Sets are groupings, not equipment. Counted stock shows without its quantity.
    kind: { in: ["item", "case"] },
  };
}

type Row = Prisma.EquipmentItemGetPayload<{ select: typeof sharedItemSelect }>;

/** Shapes a row into exactly the public fields (the booking page only when it's on). */
function toShared(row: Row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    kind: row.kind,
    manufacturer: row.manufacturer,
    model: row.model,
    powerWatts: row.powerWatts,
    batteryPowered: row.batteryPowered,
    category: row.category?.name ?? null,
    agency: {
      id: row.organization.id,
      name: row.organization.name,
      city: row.organization.city,
      bookingPage: row.organization.bookingPageEnabled ? `/b/${row.organization.slug}` : null,
    },
  };
}
export type SharedItem = ReturnType<typeof toShared>;

export async function sharedInventory(viewerOrganizationId: string, filters: { q?: string; agencyId?: string | null; page?: number; pageSize?: number } = {}) {
  const pageSize = filters.pageSize ?? 50;
  const page = Math.max(1, filters.page ?? 1);
  const q = filters.q?.trim();
  const where: Prisma.EquipmentItemWhereInput = {
    AND: [
      sharedWhere(viewerOrganizationId),
      q ? { OR: [{ code: { contains: q } }, { name: { contains: q } }, { manufacturer: { contains: q } }, { model: { contains: q } }, { category: { name: { contains: q } } }] } : {},
      filters.agencyId ? { organizationId: filters.agencyId } : {},
    ],
  };
  const [total, rows, agencies] = await Promise.all([
    prisma.equipmentItem.count({ where }),
    prisma.equipmentItem.findMany({ where, select: sharedItemSelect, orderBy: [{ organization: { name: "asc" } }, { code: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
    prisma.organization.findMany({
      where: { id: { not: viewerOrganizationId }, inventorySharing: true, suspendedAt: null, equipmentItems: { some: sharedWhere(viewerOrganizationId) } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { total, page, pages: Math.max(1, Math.ceil(total / pageSize)), items: rows.map(toShared), agencies };
}

/** One shared item, or null when it isn't (or is no longer) shared with the viewer. */
export async function sharedItem(viewerOrganizationId: string, itemId: string) {
  const row = await prisma.equipmentItem.findFirst({ where: { AND: [{ id: itemId }, sharedWhere(viewerOrganizationId)] }, select: sharedItemSelect });
  return row ? toShared(row) : null;
}
