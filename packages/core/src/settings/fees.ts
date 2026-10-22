import { z } from "zod";

export const feeRuleSchema = z
  .object({
    type: z.enum(["none", "percentage", "fixed", "percentage_plus_fixed"]),
    percentageBps: z.int().min(0).max(10_000).default(0),
    fixedCents: z.int().min(0).default(0),
    minCents: z.int().min(0).nullable().default(null),
    maxCents: z.int().min(0).nullable().default(null),
  })
  .refine((r) => r.minCents === null || r.maxCents === null || r.minCents <= r.maxCents, {
    message: "The minimum fee can't be higher than the maximum fee",
    path: ["minCents"],
  });

export type FeeRule = z.infer<typeof feeRuleSchema>;

export const platformFeeSettingsSchema = z.object({
  /** Platform-wide default; plans and agencies can override it. */
  defaultRule: feeRuleSchema,
  /** Who carries Stripe's processing cost on booking payments. */
  stripeFeePaidBy: z.enum(["agency", "platform"]),
  /** Optional fee shown to the customer as its own quote line (never a card surcharge). */
  customerServiceFeeCents: z.int().min(0),
});

export type PlatformFeeSettings = z.infer<typeof platformFeeSettingsSchema>;
