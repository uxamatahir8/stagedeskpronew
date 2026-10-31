import { describe, expect, it } from "vitest";
import {
  availabilityOn,
  checkReserve,
  claimOn,
  type ClaimLine,
  equipmentItemSchema,
  equipmentStage,
  equipmentTotals,
  loadableNow,
  loadError,
  lostError,
  membershipError,
  normalizeEquipmentCode,
  packagePickError,
  reservationsBrokenBy,
  outstandingOf,
  packageLineSchema,
  plannedQuantityError,
  powerTotal,
  resolvePackage,
  returnError,
  usableStock,
  type PackageCandidate,
} from "./inventory";

const today = "2027-06-10";
const D = "2027-06-12";
const cables = { kind: "item", tracking: "bulk", status: "available", quantity: 10, defectiveQty: 0 };
const speaker = { kind: "item", tracking: "unit", status: "available", quantity: 1, defectiveQty: 0 };

const line = (over: Partial<ClaimLine> = {}): ClaimLine => ({
  bookingId: "A",
  quantity: 4,
  loadedQty: 0,
  returnedQty: 0,
  damagedQty: 0,
  lostQty: 0,
  reservedAt: new Date(),
  bookingStatus: "booked",
  eventDate: D,
  checkedIn: false,
  ...over,
});

describe("item input", () => {
  it("normalizes codes and refuses odd ones", () => {
    expect(normalizeEquipmentCode("  spk   12 ")).toBe("SPK 12");
    expect(equipmentItemSchema.safeParse({ code: "spk-1", name: "Speaker" }).success).toBe(true);
    expect(equipmentItemSchema.safeParse({ code: "", name: "Speaker" }).success).toBe(false);
    expect(equipmentItemSchema.safeParse({ code: "-X", name: "Speaker" }).success).toBe(false);
  });

  it("keeps unit items, cases and sets at quantity 1", () => {
    expect(equipmentItemSchema.parse({ code: "S1", name: "S", quantity: 5 }).quantity).toBe(1);
    const c = equipmentItemSchema.parse({ code: "C1", name: "Case", kind: "case", tracking: "bulk", quantity: 3, containerId: "x" });
    expect([c.tracking, c.quantity, c.containerId]).toEqual(["unit", 1, null]);
  });

  it("keeps counted stock out of cases and without serial numbers", () => {
    const b = equipmentItemSchema.parse({ code: "XLR", name: "XLR", tracking: "bulk", quantity: 40, containerId: "c", serialNumber: "123" });
    expect([b.quantity, b.containerId, b.serialNumber]).toEqual([40, null, null]);
  });

  it("gives sets no power", () => {
    expect(equipmentItemSchema.parse({ code: "SET", name: "Pair", kind: "set", powerWatts: 500 }).powerWatts).toBeNull();
  });
});

describe("cases and sets", () => {
  const caseItem = { id: "c1", kind: "case", containerId: null };
  it("accepts a numbered item into a case or set", () => {
    expect(membershipError({ kind: "item", tracking: "unit" }, caseItem)).toBeNull();
    expect(membershipError({ kind: "item", tracking: "unit" }, { ...caseItem, kind: "set" })).toBeNull();
  });
  it("refuses nesting, self, counted stock and non-containers", () => {
    expect(membershipError({ id: "c1", kind: "item", tracking: "unit" }, caseItem)).toBe("self");
    expect(membershipError({ kind: "case", tracking: "unit" }, caseItem)).toBe("not_unit_item");
    expect(membershipError({ kind: "item", tracking: "bulk" }, caseItem)).toBe("not_unit_item");
    expect(membershipError({ kind: "item", tracking: "unit" }, { ...caseItem, containerId: "c0" })).toBe("nested");
    expect(membershipError({ kind: "item", tracking: "unit" }, { ...caseItem, kind: "item" })).toBe("container_kind");
  });
});

describe("usable stock", () => {
  it("counts only available, non-defective units; sets are not stock", () => {
    expect(usableStock(cables)).toBe(10);
    expect(usableStock({ ...cables, defectiveQty: 3 })).toBe(7);
    expect(usableStock({ ...speaker, status: "maintenance" })).toBe(0);
    for (const status of ["defective", "lost", "retired"]) expect(usableStock({ ...speaker, status })).toBe(0);
    expect(usableStock({ ...speaker, kind: "set" })).toBe(0);
  });
});

describe("availability: 10 cables, booking A reserves 4 on D", () => {
  const other = "B";
  it("reserved, nothing loaded: 6 free on D, 10 on other dates", () => {
    const l = [line()];
    expect(availabilityOn(cables, l, D, today, other).free).toBe(6);
    expect(availabilityOn(cables, l, "2027-06-20", today, other).free).toBe(10);
  });

  it("reserved and loaded: counted once, not twice", () => {
    const l = [line({ loadedQty: 4 })];
    expect(claimOn(l[0]!, D, today)).toBe(4);
    expect(availabilityOn(cables, l, D, today, other).free).toBe(6);
    // Out until the gig's date, so earlier dates see them gone too…
    expect(availabilityOn(cables, l, "2027-06-11", today, other).free).toBe(6);
    // …and later dates expect them back.
    expect(availabilityOn(cables, l, "2027-06-20", today, other).free).toBe(10);
  });

  it("3 back fine, 1 back damaged", () => {
    const item = { ...cables, defectiveQty: 1 };
    const l = [line({ loadedQty: 4, returnedQty: 3, damagedQty: 1 })];
    expect(availabilityOn(item, l, D, today, other).free).toBe(6);
    expect(availabilityOn(item, l, "2027-06-20", today, other).free).toBe(9);
  });

  it("3 back fine, 1 missing: missing blocks every date", () => {
    const l = [line({ loadedQty: 4, returnedQty: 3, checkedIn: true })];
    expect(outstandingOf(l[0]!)).toBe(1);
    expect(availabilityOn(cables, l, D, today, other).free).toBe(6);
    expect(availabilityOn(cables, l, "2027-07-01", today, other).free).toBe(9);
  });

  it("…then the missing one confirmed lost (stock 9)", () => {
    const item = { ...cables, quantity: 9 };
    const l = [line({ loadedQty: 4, returnedQty: 3, lostQty: 1, checkedIn: true })];
    expect(availabilityOn(item, l, D, today, other).free).toBe(6);
    expect(availabilityOn(item, l, "2027-07-01", today, other).free).toBe(9);
  });

  it("overdue equipment blocks every date until it's back", () => {
    const l = [line({ eventDate: "2027-06-01", loadedQty: 4, returnedQty: 2 })];
    expect(availabilityOn(cables, l, "2027-07-01", today, other).free).toBe(8);
  });

  it("partial returns free units on later dates only", () => {
    const l = [line({ loadedQty: 4, returnedQty: 1 })];
    expect(availabilityOn(cables, l, D, today, other).free).toBe(6);
    expect(availabilityOn(cables, l, "2027-06-11", today, other).free).toBe(7);
  });

  it("ignores the booking's own lines", () => {
    expect(availabilityOn(cables, [line()], D, today, "A").free).toBe(10);
  });

  it("only booked and confirmed bookings with a reservation hold stock", () => {
    for (const bookingStatus of ["inquiry", "quoted", "cancelled", "expired", "declined", "completed"]) {
      expect(availabilityOn(cables, [line({ bookingStatus })], D, today, other).free).toBe(10);
    }
    expect(availabilityOn(cables, [line({ bookingStatus: "confirmed" })], D, today, other).free).toBe(6);
    expect(availabilityOn(cables, [line({ reservedAt: null })], D, today, other).free).toBe(10);
  });

  it("loaded equipment stays out whatever happens to its booking", () => {
    const l = [line({ bookingStatus: "cancelled", loadedQty: 4 })];
    expect(availabilityOn(cables, l, D, today, other).free).toBe(6);
    // No gig to come back from: out on every date until it's returned.
    expect(availabilityOn(cables, l, "2027-07-01", today, other).free).toBe(6);
  });
});

describe("reserving", () => {
  it("allows what fits", () => {
    expect(checkReserve(cables, availabilityOn(cables, [line()], D, today, "B"), 6)).toEqual({ ok: true });
  });
  it("only same-day reservations can be overridden", () => {
    const r = checkReserve(cables, availabilityOn(cables, [line()], D, today, "B"), 8);
    expect(r).toMatchObject({ ok: false, shortage: "reserved", overridable: true, free: 6 });
  });
  it("physically out equipment can't be overridden", () => {
    const r = checkReserve(cables, availabilityOn(cables, [line({ loadedQty: 4 })], D, today, "B"), 8);
    expect(r).toMatchObject({ ok: false, shortage: "unavailable", overridable: false });
  });
  it("unusable equipment can't be overridden", () => {
    const item = { ...speaker, status: "defective" };
    expect(checkReserve(item, availabilityOn(item, [], D, today, "B"), 1)).toMatchObject({ shortage: "unusable", overridable: false });
  });
  it("a speaker reserved elsewhere that day is a same-day conflict", () => {
    const r = checkReserve(speaker, availabilityOn(speaker, [line({ quantity: 1 })], D, today, "B"), 1);
    expect(r).toMatchObject({ shortage: "reserved", overridable: true });
  });
});

describe("loading", () => {
  const own = line({ bookingId: "B", quantity: 6 });
  it("loads up to the plan when stock is there", () => {
    expect(loadableNow(cables, own, [line()], D, today)).toBe(6);
  });
  it("counts this line's own loaded units once (incremental loading)", () => {
    expect(loadableNow(cables, { ...own, loadedQty: 2 }, [line()], D, today)).toBe(4);
  });
  it("can't load what's out for another gig", () => {
    const outElsewhere = line({ eventDate: "2027-06-09", loadedQty: 4, bookingStatus: "completed" });
    expect(loadableNow(cables, own, [outElsewhere], D, today)).toBe(6);
    expect(loadableNow(cables, { ...own, quantity: 8 }, [outElsewhere], D, today)).toBe(6);
  });
  it("can't load unreserved lines, or on bookings that aren't booked or confirmed", () => {
    expect(loadableNow(cables, { ...own, reservedAt: null }, [], D, today)).toBe(0);
    expect(loadableNow(cables, { ...own, bookingStatus: "quoted" }, [], D, today)).toBe(0);
  });
  it("can't load defective equipment", () => {
    expect(loadableNow({ ...speaker, status: "defective" }, { ...own, quantity: 1 }, [], D, today)).toBe(0);
  });
  it("an overridden same-day conflict loads when the other gig's units are physically back", () => {
    const morning = line({ quantity: 1 });
    const evening = line({ bookingId: "B", quantity: 1, overrideReason: "morning and evening gig" });
    expect(loadableNow(speaker, { ...evening, overrideReason: null }, [morning], D, today)).toBe(0);
    expect(loadableNow(speaker, evening, [morning], D, today)).toBe(1);
    expect(loadableNow(speaker, evening, [{ ...morning, loadedQty: 1 }], D, today)).toBe(0);
    expect(loadableNow(speaker, evening, [{ ...morning, loadedQty: 1, returnedQty: 1 }], D, today)).toBe(1);
  });
});

describe("line changes", () => {
  const l = { quantity: 4, loadedQty: 3, returnedQty: 1, damagedQty: 0, lostQty: 0 };
  it("never loads beyond the plan or unloads resolved units", () => {
    expect(loadError(l, 1)).toBeNull();
    expect(loadError(l, 2)).toBe("too_many");
    expect(loadError(l, -2)).toBeNull();
    expect(loadError(l, -3)).toBe("negative");
  });
  it("returns only what's outstanding", () => {
    expect(returnError(l, 1, 1)).toBeNull();
    expect(returnError(l, 2, 1)).toBe("too_many");
    expect(returnError({ ...l, loadedQty: 0, returnedQty: 0 }, 1, 0)).toBe("not_loaded");
    expect(returnError(l, -1, 0)).toBe("negative");
  });
  it("confirms lost only for outstanding units", () => {
    expect(lostError(l, 2)).toBeNull();
    expect(lostError(l, 3)).toBe("too_many");
    expect(lostError({ ...l, returnedQty: 3 }, 1)).toBe("nothing_outstanding");
  });
  it("keeps the plan at or above what's loaded", () => {
    expect(plannedQuantityError(l, 3)).toBeNull();
    expect(plannedQuantityError(l, 2)).toBe("too_many");
    expect(plannedQuantityError(l, 0)).toBe("negative");
  });
});

describe("stage", () => {
  const stage = (lines: Parameters<typeof equipmentTotals>[0], over: { eventDate?: string | null; checkedIn?: boolean } = {}) =>
    equipmentStage({ totals: equipmentTotals(lines), eventDate: over.eventDate === undefined ? D : over.eventDate, today, checkedIn: over.checkedIn ?? false });
  const base = { quantity: 2, loadedQty: 0, returnedQty: 0, damagedQty: 0, lostQty: 0, reservedAt: new Date() };

  it("walks packing → loading → out → returning → complete", () => {
    expect(stage([])).toBe("none");
    expect(stage([base])).toBe("packing");
    expect(stage([{ ...base, loadedQty: 1 }])).toBe("loading");
    expect(stage([{ ...base, loadedQty: 2 }])).toBe("out");
    expect(stage([{ ...base, loadedQty: 1 }], { eventDate: today })).toBe("out");
    expect(stage([{ ...base, loadedQty: 2, returnedQty: 1 }])).toBe("returning");
    expect(stage([{ ...base, loadedQty: 2, returnedQty: 1, damagedQty: 1 }])).toBe("complete");
  });
  it("is complete when everything loaded is resolved, even if some was never taken", () => {
    expect(stage([{ ...base, loadedQty: 1, returnedQty: 1 }])).toBe("complete");
  });
  it("shows missing only after check-in, and never counts missing as returned", () => {
    expect(stage([{ ...base, loadedQty: 2, returnedQty: 1 }], { checkedIn: true })).toBe("missing");
    expect(stage([{ ...base, loadedQty: 2, returnedQty: 1, lostQty: 1 }], { checkedIn: true })).toBe("complete");
  });
  it("is unused when the date passed with nothing loaded", () => {
    expect(stage([base], { eventDate: "2027-06-01" })).toBe("unused");
  });
  it("counts unreserved lines", () => {
    expect(equipmentTotals([{ ...base, reservedAt: null }, base]).unreserved).toBe(1);
  });
});

describe("power", () => {
  it("adds item power times quantity, not cases or sets", () => {
    expect(
      powerTotal([
        { quantity: 2, item: { kind: "item", powerWatts: 500 } },
        { quantity: 1, item: { kind: "case", powerWatts: 100 } },
        { quantity: 3, item: { kind: "item", powerWatts: null } },
      ]),
    ).toBe(1000);
  });
});

describe("packages", () => {
  const cand = (over: Partial<PackageCandidate>): PackageCandidate => ({
    id: "x",
    code: "X",
    kind: "item",
    tracking: "unit",
    status: "available",
    quantity: 1,
    defectiveQty: 0,
    categoryId: "spk",
    containerId: null,
    free: 1,
    ...over,
  });
  const speakers = [cand({ id: "s2", code: "SPK-2" }), cand({ id: "s10", code: "SPK-10" }), cand({ id: "s1", code: "SPK-1" }), cand({ id: "s3", code: "SPK-3", free: 0 })];

  it("a line needs exactly one of item or category", () => {
    expect(packageLineSchema.safeParse({ itemId: "a", categoryId: null, quantity: 1 }).success).toBe(true);
    expect(packageLineSchema.safeParse({ itemId: "a", categoryId: "b", quantity: 1 }).success).toBe(false);
    expect(packageLineSchema.safeParse({ itemId: null, categoryId: null, quantity: 1 }).success).toBe(false);
  });

  it("picks free loose items from a category in code order", () => {
    const picks = resolvePackage([{ itemId: null, categoryId: "spk", quantity: 2 }], speakers, new Set());
    expect(picks.map((p) => p.itemId)).toEqual(["s1", "s2"]);
  });

  it("reports what's short and never picks the same item twice", () => {
    const picks = resolvePackage(
      [
        { itemId: "s1", categoryId: null, quantity: 1 },
        { itemId: null, categoryId: "spk", quantity: 3 },
      ],
      speakers,
      new Set(["s2"]),
    );
    expect(picks.filter((p) => p.status === "ok").map((p) => p.itemId)).toEqual(["s1", "s10"]);
    expect(picks.at(-1)).toMatchObject({ status: "short", quantity: 2, reason: "none_free" });
  });

  it("skips items already on the booking", () => {
    expect(resolvePackage([{ itemId: "s1", categoryId: null, quantity: 1 }], speakers, new Set(["s1"]))[0]).toMatchObject({
      status: "unavailable",
      reason: "already_planned",
    });
  });

  it("takes what's free of counted stock and reports the rest", () => {
    const xlr = cand({ id: "xlr", code: "XLR", tracking: "bulk", quantity: 10, free: 6, categoryId: "cab" });
    const picks = resolvePackage([{ itemId: "xlr", categoryId: null, quantity: 8 }], [xlr], new Set());
    expect(picks).toEqual([
      { lineIndex: 0, itemId: "xlr", quantity: 6, status: "ok" },
      { lineIndex: 0, itemId: null, quantity: 2, status: "short", reason: "unavailable" },
    ]);
  });

  it("doesn't pick items inside cases or sets for category lines", () => {
    const picks = resolvePackage([{ itemId: null, categoryId: "spk", quantity: 1 }], [cand({ id: "in", containerId: "case" })], new Set());
    expect(picks[0]).toMatchObject({ status: "unavailable" });
  });
});

describe("stock changes against reservations", () => {
  const res = (id: string, quantity: number, reservedAt: number, over: Partial<ClaimLine> = {}) => ({ ...line({ quantity, reservedAt: new Date(reservedAt), bookingId: id, ...over }), id });

  it("keeps reservations that still fit", () => {
    expect(reservationsBrokenBy(cables, { ...cables, quantity: 8 }, [res("a", 4, 1), res("b", 4, 2)], today)).toEqual([]);
  });
  it("releases the latest reservations until the date fits again (10 → 3 with 10 reserved)", () => {
    const lines = [res("a", 4, 1), res("b", 6, 2)];
    expect(reservationsBrokenBy(cables, { ...cables, quantity: 3 }, lines, today).map((l) => l.id)).toEqual(["b", "a"]);
    expect(reservationsBrokenBy(cables, { ...cables, quantity: 4 }, lines, today).map((l) => l.id)).toEqual(["b"]);
  });
  it("counts defective units and status changes", () => {
    expect(reservationsBrokenBy(cables, { ...cables, defectiveQty: 3 }, [res("a", 8, 1)], today).map((l) => l.id)).toEqual(["a"]);
    expect(reservationsBrokenBy(speaker, { ...speaker, status: "maintenance" }, [{ ...res("a", 1, 1) }], today).map((l) => l.id)).toEqual(["a"]);
  });
  it("ignores past dates, unreserved lines, quotes and loaded lines", () => {
    const lines = [res("past", 4, 1, { eventDate: "2027-06-01" }), res("plan", 4, 2, { reservedAt: null }), res("quote", 4, 3, { bookingStatus: "quoted" }), res("out", 4, 4, { loadedQty: 4 })];
    expect(reservationsBrokenBy(speaker, { ...speaker, status: "defective" }, lines, today)).toEqual([]);
  });
  it("doesn't count an existing same-day override as broken", () => {
    const lines = [res("morning", 1, 1), res("evening", 1, 2, { overrideReason: "two gigs" })];
    expect(reservationsBrokenBy(speaker, speaker, lines, today)).toEqual([]);
  });
});

describe("package picks against the template", () => {
  const items = new Map([
    ["s1", { kind: "item", tracking: "unit", categoryId: "spk", containerId: null }],
    ["s2", { kind: "item", tracking: "unit", categoryId: "spk", containerId: null }],
    ["s3", { kind: "item", tracking: "unit", categoryId: "spk", containerId: null }],
    ["in", { kind: "item", tracking: "unit", categoryId: "spk", containerId: "case" }],
    ["l1", { kind: "item", tracking: "unit", categoryId: "light", containerId: null }],
    ["xlr", { kind: "item", tracking: "bulk", categoryId: "cab", containerId: null }],
  ]);
  const lines = [
    { itemId: null, categoryId: "spk", quantity: 2 },
    { itemId: "xlr", categoryId: null, quantity: 6 },
  ];
  it("accepts what the package allows, including fewer than asked", () => {
    expect(packagePickError(lines, [{ itemId: "s1", quantity: 1 }, { itemId: "s2", quantity: 1 }, { itemId: "xlr", quantity: 6 }], items)).toBeNull();
    expect(packagePickError(lines, [{ itemId: "xlr", quantity: 2 }], items)).toBeNull();
  });
  it("refuses manipulated picks", () => {
    expect(packagePickError(lines, [{ itemId: "s1", quantity: 1 }, { itemId: "s1", quantity: 1 }], items)).toBe("duplicate");
    expect(packagePickError(lines, [{ itemId: "s1", quantity: 1 }, { itemId: "s2", quantity: 1 }, { itemId: "s3", quantity: 1 }], items)).toBe("too_many");
    expect(packagePickError(lines, [{ itemId: "xlr", quantity: 7 }], items)).toBe("too_many");
    expect(packagePickError(lines, [{ itemId: "l1", quantity: 1 }], items)).toBe("wrong_category");
    expect(packagePickError(lines, [{ itemId: "in", quantity: 1 }], items)).toBe("wrong_category");
    expect(packagePickError(lines, [{ itemId: "s1", quantity: 3 }], items)).toBe("wrong_category");
    expect(packagePickError(lines, [{ itemId: "unknown", quantity: 1 }], items)).toBe("not_in_package");
  });
});
