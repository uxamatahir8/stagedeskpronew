import { z } from "zod";

/**
 * Every limit a plan can set. Code checks these keys; the super admin only
 * sets the values. `null` on a count means unlimited.
 */
export const planLimitsSchema = z.object({
  maxArtists: z.int().min(0).nullable(),
  maxStaff: z.int().min(0).nullable(),
  maxBookingsPerMonth: z.int().min(0).nullable(),
  storageGb: z.int().min(0).nullable(),
  bookingPage: z.boolean(),
  embedWidget: z.boolean(),
  customDomain: z.boolean(),
  removeBranding: z.boolean(),
  artistSharing: z.boolean(),
});

export type PlanLimits = z.infer<typeof planLimitsSchema>;
export type CountLimit = "maxArtists" | "maxStaff" | "maxBookingsPerMonth" | "storageGb";
export type FeatureFlag = "bookingPage" | "embedWidget" | "customDomain" | "removeBranding" | "artistSharing";

export const countLimits: readonly CountLimit[] = ["maxArtists", "maxStaff", "maxBookingsPerMonth", "storageGb"];
export const featureFlags: readonly FeatureFlag[] = ["bookingPage", "embedWidget", "customDomain", "removeBranding", "artistSharing"];

/** Used when an agency has no plan at all (shouldn't happen after onboarding). */
export const fallbackLimits: PlanLimits = {
  maxArtists: 2,
  maxStaff: 1,
  maxBookingsPerMonth: 10,
  storageGb: 1,
  bookingPage: true,
  embedWidget: false,
  customDomain: false,
  removeBranding: false,
  artistSharing: false,
};

/** An independent artist works for free: one artist (themselves), no team, unlimited bookings. */
export const soloLimits: PlanLimits = {
  maxArtists: 1,
  maxStaff: 1,
  maxBookingsPerMonth: null,
  storageGb: 1,
  bookingPage: false,
  embedWidget: false,
  customDomain: false,
  removeBranding: false,
  artistSharing: false,
};

export function parseLimits(value: unknown): PlanLimits {
  const result = planLimitsSchema.safeParse(value);
  return result.success ? result.data : fallbackLimits;
}

/** Whether one more item fits within a count limit. */
export function withinLimit(limits: PlanLimits, key: CountLimit, current: number): boolean {
  const max = limits[key];
  return max === null || current < max;
}

export const localizedText = z.object({ nl: z.string().max(500), en: z.string().max(500) });
export type LocalizedText = z.infer<typeof localizedText>;

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "unpaid" | "canceled" | "incomplete";

export type AccessReason = "trial" | "active" | "grace" | "trial_ended" | "payment_failed" | "canceled" | "none" | "free";

export interface SubscriptionAccess {
  /** "read_only" keeps all data visible but blocks changes until the agency pays. */
  level: "full" | "read_only";
  reason: AccessReason;
  /** When full access ends during a trial or grace period. */
  until: Date | null;
}

/**
 * What an agency may do based on its subscription. After a trial ends or a
 * payment fails there are `graceDays` of full access, then read-only.
 * Data is never hidden or deleted.
 */
export function subscriptionAccess(
  sub: { status: string; trialEndsAt: Date | null; pastDueSince: Date | null } | null,
  now: Date,
  graceDays: number,
): SubscriptionAccess {
  const grace = (from: Date) => new Date(from.getTime() + graceDays * 86_400_000);
  if (!sub) return { level: "read_only", reason: "none", until: null };

  switch (sub.status) {
    case "active":
      return { level: "full", reason: "active", until: null };
    case "trialing": {
      if (!sub.trialEndsAt || sub.trialEndsAt > now) return { level: "full", reason: "trial", until: sub.trialEndsAt };
      const end = grace(sub.trialEndsAt);
      return end > now ? { level: "full", reason: "grace", until: end } : { level: "read_only", reason: "trial_ended", until: null };
    }
    case "past_due":
    case "unpaid": {
      const end = grace(sub.pastDueSince ?? now);
      return end > now ? { level: "full", reason: "grace", until: end } : { level: "read_only", reason: "payment_failed", until: null };
    }
    default:
      return { level: "read_only", reason: "canceled", until: null };
  }
}
