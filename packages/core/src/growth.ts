/** Why an agency cancels its plan; asked in the cancel dialog and counted on the admin dashboard. */
export const cancellationReasons = ["too_expensive", "missing_features", "too_complex", "other_tool", "few_bookings", "closing", "other"] as const;
export type CancellationReason = (typeof cancellationReasons)[number];

export function isCancellationReason(value: unknown): value is CancellationReason {
  return typeof value === "string" && (cancellationReasons as readonly string[]).includes(value);
}

/** Who can invite another agency to StageDesk: an agency (its referral reward applies) or an artist. */
export const agencyInviteKinds = ["agency", "artist"] as const;
export type AgencyInviteKind = (typeof agencyInviteKinds)[number];

/** Invites one person may send per day, against spam through our mail server. */
export const AGENCY_INVITES_PER_DAY = 20;
/** The same address isn't invited twice by the same person within this many days. */
export const AGENCY_INVITE_REPEAT_DAYS = 30;
