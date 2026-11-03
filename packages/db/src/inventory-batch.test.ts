import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { equipmentItemSchema } from "@stagedesk/core";
import { prisma } from "./client";
import { createItem, createItems, InventoryError, MAX_BATCH, setItemStatus, suggestCodes } from "./inventory";
import { purgeInventory } from "./inventory";

/** Client feedback CF-02: identical devices added at once, each with its own number and serial. */
const run = `ib${Date.now().toString(36)}`;
const org = `${run}-a`;
const other = `${run}-b`;
const owner = `${run}-owner`;
const light = (extra: Record<string, unknown> = {}) => equipmentItemSchema.parse({ code: "X", name: "Moving head", manufacturer: "Chauvet", model: "Intimidator", ...extra });

beforeAll(async () => {
  await prisma.organization.createMany({ data: [{ id: org, name: "Batch Agency", slug: `${run}-a` }, { id: other, name: "Other", slug: `${run}-b` }] });
  await prisma.user.create({ data: { id: owner, name: "Owner", email: `${run}-o@test.local` } });
});

afterAll(async () => {
  await prisma.$transaction((tx) => purgeInventory(tx, [org, other]));
  await prisma.organization.deleteMany({ where: { id: { in: [org, other] } } });
  await prisma.user.deleteMany({ where: { id: owner } });
  await prisma.$disconnect();
});

const codesOf = async (ids: string[]) => (await prisma.equipmentItem.findMany({ where: { id: { in: ids } }, orderBy: { code: "asc" } })).map((i) => [i.code, i.serialNumber, i.quantity]);

describe("batch of serialised devices", () => {
  it("suggests consecutive numbers after the highest one in use", async () => {
    expect(await suggestCodes(org, "light", 4)).toEqual(["LIGHT-001", "LIGHT-002", "LIGHT-003", "LIGHT-004"]);
    await createItem(org, light({ code: "LIGHT-7" }), owner);
    expect(await suggestCodes(org, "LIGHT", 2)).toEqual(["LIGHT-008", "LIGHT-009"]);
  });

  it("creates 1, 2 and 4 devices, each its own item with its own serial", async () => {
    for (const n of [1, 2, 4]) {
      const codes = await suggestCodes(org, `L${n}`, n);
      const ids = await createItems(org, light(), codes.map((code, i) => ({ code, serialNumber: `SN-${n}-${i}` })), owner);
      expect(ids).toHaveLength(n);
      const rows = await codesOf(ids);
      expect(rows.map((r) => r[2])).toEqual(Array(n).fill(1));
      expect(new Set(rows.map((r) => r[1])).size).toBe(n);
    }
    // Each one has its own history.
    const [first] = await createItems(org, light(), [{ code: "SOLO-1", serialNumber: "ONE" }], owner);
    expect(await prisma.equipmentEvent.count({ where: { itemId: first, type: "created" } })).toBe(1);
  });

  it("handles a large batch, and refuses more than the maximum", async () => {
    const codes = await suggestCodes(org, "CABLEBOX", 40);
    expect(await createItems(org, light(), codes.map((code) => ({ code })), owner)).toHaveLength(40);
    await expect(createItems(org, light(), Array.from({ length: MAX_BATCH + 1 }, (_, i) => ({ code: `MAX-${i}` })), owner)).rejects.toThrow("batch_invalid");
  });

  it("creates nothing when one code or serial is wrong, taken or repeated", async () => {
    const before = await prisma.equipmentItem.count({ where: { organizationId: org } });
    const attempt = async (units: { code: string; serialNumber?: string }[]) => (await createItems(org, light(), units, owner).then(() => null, (e: unknown) => e)) as InventoryError;
    expect((await attempt([{ code: "NEW-1" }, { code: "new-1" }])).code).toBe("code_taken");
    expect((await attempt([{ code: "NEW-1" }, { code: "LIGHT-7" }])).detail).toEqual({ codes: ["LIGHT-7"] });
    expect((await attempt([{ code: "NEW-1", serialNumber: "AA 1" }, { code: "NEW-2", serialNumber: "aa1" }])).code).toBe("serial_taken");
    expect((await attempt([{ code: "NEW-1", serialNumber: "SN-4-0" }])).code).toBe("serial_taken");
    expect((await attempt([{ code: "NEW-1" }, { code: "bad code!" }])).code).toBe("batch_invalid");
    expect(await prisma.equipmentItem.count({ where: { organizationId: org } })).toBe(before);
  });

  it("allows the same serial from another manufacturer or another agency", async () => {
    await createItems(org, light({ manufacturer: "ADJ" }), [{ code: "ADJ-1", serialNumber: "SN-4-0" }], owner);
    await createItems(other, light(), [{ code: "LIGHT-001", serialNumber: "SN-4-0" }], owner);
  });

  it("refuses counted stock and sets in a batch", async () => {
    await expect(createItems(org, light({ tracking: "bulk", quantity: 4 }), [{ code: "B-1" }], owner)).rejects.toThrow("batch_invalid");
    await expect(createItems(org, light({ kind: "set" }), [{ code: "S-1" }], owner)).rejects.toThrow("batch_invalid");
  });

  it("gives overlapping batches saved at the same moment to one of them entirely", async () => {
    const a = ["RACE-1", "RACE-2", "RACE-3"].map((code) => ({ code }));
    const b = ["RACE-3", "RACE-4"].map((code) => ({ code }));
    const results = await Promise.allSettled([createItems(org, light(), a, owner), createItems(org, light(), b, owner)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const made = await prisma.equipmentItem.findMany({ where: { organizationId: org, code: { startsWith: "RACE-" } }, select: { code: true } });
    // Never a partial batch: either RACE-1…3 or RACE-3…4.
    expect([3, 2]).toContain(made.length);
  });

  it("refuses a single item with a serial already used for that manufacturer", async () => {
    await expect(createItem(org, light({ code: "DUP-1", serialNumber: "sn-1-0" }), owner)).rejects.toThrow("serial_taken");
  });

  it("marks one device of a batch defective without touching the others", async () => {
    const ids = await createItems(org, light(), [{ code: "DEF-1" }, { code: "DEF-2" }], owner);
    await setItemStatus(org, ids[0]!, "defective", owner, "Lamp broken");
    const rows = await prisma.equipmentItem.findMany({ where: { id: { in: ids } }, orderBy: { code: "asc" }, select: { status: true } });
    expect(rows.map((r) => r.status)).toEqual(["defective", "available"]);
  });
});
