/**
 * Roles and permissions. The UI (sidebar, buttons) and server actions both
 * check `can()`, so what someone sees and what they may do never disagree.
 */
export const platformRoles = ["platform_admin", "affiliate"] as const;
export const organizationRoles = ["agency_owner", "agency_admin", "agency_staff", "artist", "customer"] as const;
export const roles = [...platformRoles, ...organizationRoles] as const;

export type Role = (typeof roles)[number];

export const permissions = [
  "platform.agencies",
  "platform.plans",
  "platform.settings",
  "platform.pages",
  "platform.affiliates",
  "platform.payments",
  "agency.bookings",
  "agency.quotes",
  "agency.calendar",
  "agency.artists",
  "agency.customers",
  "agency.payments",
  "agency.team",
  "agency.settings",
  "agency.billing",
  "artist.gigs",
  "artist.availability",
  "artist.earnings",
  "customer.event",
  "customer.payments",
  "affiliate.dashboard",
  "affiliate.links",
  "affiliate.payouts",
  "messages",
  "support",
] as const;

export type Permission = (typeof permissions)[number];

const agencyCore: Permission[] = [
  "agency.bookings",
  "agency.quotes",
  "agency.calendar",
  "agency.artists",
  "agency.customers",
  "messages",
  "support",
];

const grants: Record<Role, readonly Permission[]> = {
  platform_admin: [
    "platform.agencies",
    "platform.plans",
    "platform.settings",
    "platform.pages",
    "platform.affiliates",
    "platform.payments",
    "support",
  ],
  agency_owner: [...agencyCore, "agency.payments", "agency.team", "agency.settings", "agency.billing"],
  agency_admin: [...agencyCore, "agency.payments", "agency.team", "agency.settings"],
  agency_staff: agencyCore,
  artist: ["artist.gigs", "artist.availability", "artist.earnings", "messages", "support"],
  customer: ["customer.event", "customer.payments", "messages", "support"],
  affiliate: ["affiliate.dashboard", "affiliate.links", "affiliate.payouts", "support"],
};

export function can(role: Role, permission: Permission): boolean {
  return grants[role].includes(permission);
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (roles as readonly string[]).includes(value);
}
