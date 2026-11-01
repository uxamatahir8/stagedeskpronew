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

describe("inventory permissions", () => {
  it("gives the matrix from the inventory plan", () => {
    for (const p of ["agency.inventory", "agency.inventory.manage", "agency.inventory.gigs", "agency.inventory.admin"] as const) {
      expect(can("agency_owner", p)).toBe(true);
      expect(can("agency_admin", p)).toBe(true);
      expect(can("solo_artist", p)).toBe(true);
      expect(can("artist", p)).toBe(false);
      expect(can("customer", p)).toBe(false);
    }
    expect(can("agency_staff", "agency.inventory")).toBe(true);
    expect(can("agency_staff", "agency.inventory.gigs")).toBe(true);
    expect(can("agency_staff", "agency.inventory.manage")).toBe(false);
    expect(can("agency_staff", "agency.inventory.admin")).toBe(false);
  });

  it("lets owners grant staff inventory management, never the admin-only actions", () => {
    const custom = { agency_staff: ["agency.inventory", "agency.inventory.manage", "agency.inventory.admin"] };
    expect(can("agency_staff", "agency.inventory.manage", custom)).toBe(true);
    expect(can("agency_staff", "agency.inventory.admin", custom)).toBe(false);
  });
});

describe("permissions added after an owner customised roles", () => {
  // Saved before inventory existed: no `known`.
  const legacy = {
    agency_admin: ["agency.bookings", "agency.bookings.edit", "agency.artists", "agency.team"],
    agency_staff: ["agency.bookings", "agency.bookings.edit"],
  };

  it("follow the defaults where the role holds what they build on", async () => {
    const { can } = await import("./access");
    expect(can("agency_staff", "agency.inventory", legacy)).toBe(true);
    expect(can("agency_staff", "agency.inventory.gigs", legacy)).toBe(true);
    expect(can("agency_staff", "agency.inventory.manage", legacy)).toBe(false);
    expect(can("agency_staff", "agency.inventory.admin", legacy)).toBe(false);
    // This admin wasn't given artist management or settings, so no inventory management or overrides.
    expect(can("agency_admin", "agency.inventory", legacy)).toBe(true);
    expect(can("agency_admin", "agency.inventory.manage", legacy)).toBe(false);
    expect(can("agency_admin", "agency.inventory.admin", legacy)).toBe(false);
  });

  it("never escalate a role the owner kept away from bookings", async () => {
    const { can } = await import("./access");
    const restricted = { agency_staff: ["agency.customers"] };
    expect(can("agency_staff", "agency.inventory", restricted)).toBe(false);
    expect(can("agency_staff", "agency.inventory.gigs", restricted)).toBe(false);
  });

  it("give a fully trusted admin everything, as for agencies on the defaults", async () => {
    const { can, defaultAgencyGrants } = await import("./access");
    const trusted = { agency_admin: defaultAgencyGrants.agency_admin.filter((p) => !p.startsWith("agency.inventory")) };
    for (const p of ["agency.inventory", "agency.inventory.manage", "agency.inventory.gigs", "agency.inventory.admin"] as const) expect(can("agency_admin", p, trusted)).toBe(true);
  });

  it("respect the owner's decision once they've seen them", async () => {
    const { agencyPermissions, can, sanitizeRolePermissions } = await import("./access");
    const decided = sanitizeRolePermissions({ ...legacy, known: [...agencyPermissions, "nonsense"] });
    expect(decided.known).toEqual([...agencyPermissions]);
    expect(can("agency_staff", "agency.inventory", decided)).toBe(false);
    expect(can("agency_staff", "agency.inventory.gigs", { ...decided, agency_staff: [...legacy.agency_staff, "agency.inventory.gigs"] })).toBe(true);
  });

  it("owners keep everything whatever is stored", async () => {
    const { can } = await import("./access");
    expect(can("agency_owner", "agency.inventory.admin", { agency_admin: [], agency_staff: [], known: [] })).toBe(true);
  });
});
