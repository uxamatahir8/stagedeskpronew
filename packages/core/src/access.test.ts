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
