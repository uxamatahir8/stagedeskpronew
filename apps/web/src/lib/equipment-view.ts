import "server-only";
import { bookingEquipment, listPackages, pickableItems } from "@stagedesk/db";
import type { WorkspaceProps } from "@/components/inventory/equipment-workspace";
import type { EquipmentAccess } from "@/lib/equipment-access";

/**
 * Everything the equipment workspace shows for one booking, shaped for the
 * client. Artists get the same lines without anything private (no serial
 * numbers or notes are selected here at all) and without the item picker.
 */
export async function equipmentWorkspace(access: EquipmentAccess, labels: { kind: (kind: string) => string; status: (status: string) => string }) {
  const view = await bookingEquipment(access.organizationId, access.bookingId);
  if (!view) return null;
  const [items, packages] = access.canPlan
    ? await Promise.all([pickableItems(access.organizationId), listPackages(access.organizationId)])
    : [[], []];
  const props: Omit<WorkspaceProps, "title" | "printHref"> = {
    code: access.trackingCode,
    stage: view.stage,
    reserving: view.reserving,
    editable: view.editable,
    checkedIn: view.booking.equipmentCheckedInAt !== null,
    power: view.power,
    containers: view.containers,
    lines: view.lines.map((l) => ({
      id: l.id,
      itemId: l.itemId,
      code: l.item.code,
      name: l.item.name,
      kind: l.item.kind,
      tracking: l.item.tracking,
      category: l.item.category?.name ?? null,
      categoryPosition: l.item.category?.position ?? 0,
      viaContainerId: l.viaContainerId,
      quantity: l.quantity,
      loadedQty: l.loadedQty,
      returnedQty: l.returnedQty,
      damagedQty: l.damagedQty,
      lostQty: l.lostQty,
      outstanding: l.outstanding,
      reserved: l.reservedAt !== null,
      overrideReason: l.overrideReason,
      free: l.free,
      atRisk: l.atRisk,
      loadable: l.loadable,
      powerWatts: l.item.powerWatts,
    })),
    items: items
      .filter((i) => i.status !== "lost")
      .map((i) => ({
        id: i.id,
        kind: i.kind,
        tracking: i.tracking,
        label: `${i.code} · ${i.name}${i.kind !== "item" ? ` (${labels.kind(i.kind)})` : ""}${i.tracking === "bulk" ? ` · ${i.quantity - i.defectiveQty}` : ""}${i.status !== "available" && i.kind !== "set" ? ` · ${labels.status(i.status)}` : ""}`,
      })),
    packages: packages.map((p) => ({ id: p.id, name: p.name })),
    canPlan: access.canPlan,
    canHandle: access.canHandle,
    canOverride: access.canOverride,
  };
  return { view, props };
}
