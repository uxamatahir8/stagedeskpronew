/**
 * Roles and permissions. The UI (sidebar, buttons) and server actions both
 * check the same permissions, so what someone sees and what they may do never
 * disagree.
 *
 * Agency admins and staff get a default set; the agency owner can change it
 * per agency (Team → Roles and permissions). Owners always have everything,
 * and some permissions can only be given to admins, never to staff.
 */
export const platformRoles = ["platform_admin", "affiliate"] as const;
export const organizationRoles = ["agency_owner", "agency_admin", "agency_staff", "artist", "customer", "solo_artist"] as const;
export const roles = [...platformRoles, ...organizationRoles] as const;

export type Role = (typeof roles)[number];

/**
 * The people who run a business's bookings and get its requests, payments and
 * messages: an agency's owner, admins and staff, or an independent artist.
 */
export const deskRoles = ["agency_owner", "agency_admin", "agency_staff", "solo_artist"] as const satisfies readonly Role[];

/** What an agency owner can hand out, grouped as on the permissions screen. */
export const agencyPermissionGroups = {
  bookings: ["agency.bookings", "agency.bookings.create", "agency.bookings.edit", "agency.bookings.status", "agency.leads"],
  quotes: ["agency.quotes", "agency.quotes.send", "agency.quotes.accept", "agency.services"],
  planning: ["agency.calendar", "agency.artists", "agency.artists.manage"],
  inventory: ["agency.inventory", "agency.inventory.manage", "agency.inventory.gigs", "agency.inventory.admin"],
  customers: ["agency.customers", "agency.customers.manage", "agency.reviews"],
  money: ["agency.payments", "agency.payments.record", "agency.payments.confirm", "agency.payments.refund", "agency.invoices", "agency.reports"],
  agency: ["agency.team", "agency.team.manage", "agency.settings", "agency.website", "agency.referrals"],
} as const;

export const agencyPermissions = Object.values(agencyPermissionGroups).flat();
export type AgencyPermission = (typeof agencyPermissions)[number];

/** Never delegable: only the owner manages the subscription and who may do what. */
export const ownerOnlyPermissions = ["agency.billing", "agency.permissions"] as const;

/** Things only an admin may be given, never staff (they reach outside day-to-day work). */
export const adminOnlyPermissions: readonly AgencyPermission[] = [
  "agency.team.manage",
  "agency.settings",
  "agency.payments.refund",
  // Overriding equipment conflicts and writing equipment off as lost.
  "agency.inventory.admin",
];

export const permissions = [
  "platform.agencies",
  "platform.plans",
  "platform.settings",
  "platform.pages",
  "platform.affiliates",
  "platform.payments",
  "platform.users",
  "platform.audit",
  "platform.support",
  "platform.newsletter",
  ...agencyPermissions,
  ...ownerOnlyPermissions,
  "artist.gigs",
  "artist.availability",
  "artist.earnings",
  /** An independent artist's public profile and the gigs they offer. */
  "artist.profile",
  "solo.listings",
  "customer.event",
  "customer.payments",
  "affiliate.dashboard",
  "affiliate.links",
  "affiliate.payouts",
  "messages",
  "support",
] as const;

export type Permission = (typeof permissions)[number];

/** The out-of-the-box sets for admins and staff; owners can change them per agency. */
export const defaultAgencyGrants: Record<"agency_admin" | "agency_staff", readonly AgencyPermission[]> = {
  agency_admin: agencyPermissions,
  agency_staff: [
    "agency.bookings",
    "agency.bookings.create",
    "agency.bookings.edit",
    "agency.bookings.status",
    "agency.leads",
    "agency.quotes",
    "agency.quotes.send",
    "agency.calendar",
    "agency.artists",
    "agency.customers",
    "agency.customers.manage",
    "agency.team",
    "agency.inventory",
    "agency.inventory.gigs",
  ],
};

const always = ["messages", "support"] as const;

const grants: Record<Role, readonly Permission[]> = {
  platform_admin: [
    "platform.agencies",
    "platform.plans",
    "platform.settings",
    "platform.pages",
    "platform.affiliates",
    "platform.payments",
    "platform.users",
    "platform.audit",
    "platform.support",
  "platform.newsletter",
    "support",
  ],
  agency_owner: [...agencyPermissions, ...ownerOnlyPermissions, ...always],
  agency_admin: [...defaultAgencyGrants.agency_admin, ...always],
  agency_staff: [...defaultAgencyGrants.agency_staff, ...always],
  artist: ["artist.gigs", "artist.availability", "artist.earnings", ...always],
  customer: ["customer.event", "customer.payments", ...always],
  // Runs their own bookings like a one-person agency, without a team, other artists or a website.
  solo_artist: [
    "agency.bookings",
    "agency.bookings.create",
    "agency.bookings.edit",
    "agency.bookings.status",
    "agency.leads",
    "agency.quotes",
    "agency.quotes.send",
    "agency.quotes.accept",
    "agency.services",
    "agency.calendar",
    "agency.customers",
    "agency.customers.manage",
    "agency.reviews",
    "agency.payments",
    "agency.payments.record",
    "agency.payments.confirm",
    "agency.payments.refund",
    "agency.invoices",
    "agency.reports",
    "agency.settings",
    "agency.billing",
    "agency.inventory",
    "agency.inventory.manage",
    "agency.inventory.gigs",
    "agency.inventory.admin",
    "artist.availability",
    "artist.profile",
    "solo.listings",
    ...always,
  ],
  affiliate: ["affiliate.dashboard", "affiliate.links", "affiliate.payouts", "support"],
};

/** An agency's own choice for its admins and staff, as stored on the agency. */
export type RolePermissions = Partial<Record<"agency_admin" | "agency_staff", string[]>>;

/**
 * Cleans what an owner chose: only known agency permissions, nothing
 * owner-only, and nothing admin-only for staff.
 */
export function sanitizeRolePermissions(input: unknown): RolePermissions {
  const out: RolePermissions = {};
  if (!input || typeof input !== "object") return out;
  for (const role of ["agency_admin", "agency_staff"] as const) {
    const list = (input as Record<string, unknown>)[role];
    if (!Array.isArray(list)) continue;
    out[role] = [...new Set(list.filter((p): p is AgencyPermission => (agencyPermissions as readonly string[]).includes(p as string)))].filter(
      (p) => role === "agency_admin" || !adminOnlyPermissions.includes(p),
    );
  }
  return out;
}

/** Everything a role may do, taking the agency's own settings into account. */
export function permissionsFor(role: Role, custom?: RolePermissions | null): Permission[] {
  if ((role === "agency_admin" || role === "agency_staff") && custom?.[role]) {
    const chosen = (sanitizeRolePermissions({ [role]: custom[role] })[role] ?? []) as AgencyPermission[];
    return [...chosen, ...always];
  }
  return [...grants[role]];
}

/**
 * Whether a role may do something. Pass the agency's custom grants when the
 * person works at an agency; without them the defaults apply.
 */
export function can(role: Role, permission: Permission, custom?: RolePermissions | null): boolean {
  return permissionsFor(role, custom).includes(permission);
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (roles as readonly string[]).includes(value);
}
