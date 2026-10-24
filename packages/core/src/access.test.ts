import { describe, expect, it } from "vitest";
import { can, isRole, roles } from "./access";

describe("access", () => {
  it("keeps platform administration away from every other role", () => {
    for (const role of roles.filter((r) => r !== "platform_admin")) {
      expect(can(role, "platform.settings")).toBe(false);
      expect(can(role, "platform.plans")).toBe(false);
    }
  });

  it("limits billing to the agency owner and payments to owner and admin", () => {
    expect(can("agency_owner", "agency.billing")).toBe(true);
    expect(can("agency_admin", "agency.billing")).toBe(false);
    expect(can("agency_admin", "agency.payments")).toBe(true);
    expect(can("agency_staff", "agency.payments")).toBe(false);
  });

  it("keeps customers and artists out of agency data", () => {
    expect(can("customer", "agency.bookings")).toBe(false);
    expect(can("artist", "agency.customers")).toBe(false);
  });

  it("recognises only known roles", () => {
    expect(isRole("artist")).toBe(true);
    expect(isRole("master_admin")).toBe(false);
    expect(isRole(1)).toBe(false);
  });
});

describe("agency permissions chosen by the owner", () => {
  it("replaces the defaults for that role only", async () => {
    const { can } = await import("./access");
    const custom = { agency_staff: ["agency.bookings", "agency.payments"] };
    expect(can("agency_staff", "agency.payments", custom)).toBe(true);
    expect(can("agency_staff", "agency.quotes.send", custom)).toBe(false);
    expect(can("agency_admin", "agency.quotes.send", custom)).toBe(true);
    expect(can("agency_staff", "messages", custom)).toBe(true);
  });

  it("never hands out owner-only or (to staff) admin-only permissions", async () => {
    const { can, sanitizeRolePermissions } = await import("./access");
    const custom = { agency_admin: ["agency.billing", "agency.team.manage"], agency_staff: ["agency.team.manage", "agency.settings", "nonsense"] };
    expect(can("agency_admin", "agency.billing", custom)).toBe(false);
    expect(can("agency_admin", "agency.team.manage", custom)).toBe(true);
    expect(can("agency_staff", "agency.team.manage", custom)).toBe(false);
    expect(sanitizeRolePermissions(custom).agency_staff).toEqual([]);
    expect(can("agency_owner", "agency.permissions", custom)).toBe(true);
  });
});
