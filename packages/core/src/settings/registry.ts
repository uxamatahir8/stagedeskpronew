import { z } from "zod";
import { platformFeeSettingsSchema } from "./fees";

const tierSchema = z.object({
  name: z.string().min(1),
  minPayingAgencies: z.int().min(0),
  commissionBps: z.int().min(0).max(10_000),
  perks: z.string().default(""),
});

export const affiliateProgramSchema = z.object({
  enabled: z.boolean(),
  commissionBps: z.int().min(0).max(10_000),
  /** null = lifetime */
  commissionMonths: z.int().min(1).nullable(),
  cookieDays: z.int().min(1).max(365),
  approvalDays: z.int().min(0).max(120),
  minPayoutCents: z.int().min(0),
  payoutDayOfMonth: z.int().min(1).max(28),
  promoDiscountBps: z.int().min(0).max(10_000),
  promoDiscountMonths: z.int().min(0),
  agencyReferralFreeMonths: z.int().min(0),
  manualApproval: z.boolean(),
  /** An affiliate earning more than this in one month waits for manual review. */
  reviewThresholdCents: z.int().min(0).default(100_000),
  /** request: affiliates ask for a withdrawal and an admin pays it. automatic: Stripe transfer on the payout day. */
  payoutMode: z.enum(["request", "automatic"]).default("request"),
  /** How affiliates can be paid. */
  payoutMethods: z
    .object({ stripe: z.boolean(), bank_transfer: z.boolean(), paypal: z.boolean() })
    .default({ stripe: true, bank_transfer: true, paypal: false }),
  tiers: z.array(tierSchema),
});

export const bookingDefaultsSchema = z.object({
  quoteExpiryDays: z.int().min(1).max(180),
  depositBps: z.int().min(0).max(10_000),
  balanceDueDaysBeforeEvent: z.int().min(0).max(180),
  payoutDisputeWindowDays: z.int().min(0).max(30),
  vatRatesBps: z.array(z.int().min(0).max(10_000)).min(1),
});

export const billingDefaultsSchema = z.object({
  /** Days of full access after a trial ends or a payment fails, before read-only. */
  graceDays: z.int().min(0).max(60),
  /** Plan new agencies start their trial on. */
  trialPlanKey: z.string().min(1).max(48),
});

export const siteGeneralSchema = z.object({
  siteName: z.string().min(1),
  defaultLocale: z.enum(["nl", "en"]),
  supportEmail: z.email(),
  maintenanceMode: z.boolean(),
  /** Before launch: the website collects waitlist sign-ups instead of offering a free trial. */
  waitlistMode: z.boolean().default(false),
});

/** What the website footer shows besides its link columns. */
export const siteFooterSchema = z.object({
  taglineNl: z.string().max(300),
  taglineEn: z.string().max(300),
  email: z.string().max(191),
  phone: z.string().max(40),
  address: z.string().max(300),
  kvkNumber: z.string().max(20),
  vatNumber: z.string().max(30),
  bottomNl: z.string().max(200),
  bottomEn: z.string().max(200),
  socials: z.object({
    instagram: z.string().max(300),
    facebook: z.string().max(300),
    linkedin: z.string().max(300),
    youtube: z.string().max(300),
    tiktok: z.string().max(300),
    x: z.string().max(300),
  }),
});

/** Which ways of paying agencies may offer. Each agency then chooses within these. */
export const paymentMethodsSchema = z.object({
  online: z.boolean(),
  bankTransfer: z.boolean(),
  cash: z.boolean(),
  /** Days an agency has to confirm a reported payment before it shows as overdue to review. */
  confirmWithinDays: z.int().min(1).max(60),
  /** Email the customer a receipt whenever a payment is recorded or confirmed. */
  sendReceipts: z.boolean(),
});

/**
 * Every setting the platform knows about. Admin screens edit values;
 * code adds keys. A record copies the value it was created under, so later
 * changes only affect new records.
 */
export const settingsRegistry = {
  "site.general": {
    schema: siteGeneralSchema,
    defaults: {
      siteName: "StageDesk",
      defaultLocale: "en",
      supportEmail: "support@stagedesk.pro",
      maintenanceMode: false,
      waitlistMode: false,
    },
  },
  "site.footer": {
    schema: siteFooterSchema,
    defaults: {
      taglineNl: "Boekingssoftware voor DJ- en bandbureaus in Nederland.",
      taglineEn: "Booking software for DJ and band agencies in the Netherlands.",
      email: "hallo@stagedesk.pro",
      phone: "",
      address: "Utrecht, Nederland",
      kvkNumber: "",
      vatNumber: "",
      bottomNl: "Gemaakt in Nederland",
      bottomEn: "Made in the Netherlands",
      socials: { instagram: "", facebook: "", linkedin: "", youtube: "", tiktok: "", x: "" },
    },
  },
  "fees.platform": {
    schema: platformFeeSettingsSchema,
    defaults: {
      defaultRule: { type: "percentage", percentageBps: 200, fixedCents: 0, minCents: null, maxCents: null },
      stripeFeePaidBy: "agency",
      customerServiceFeeCents: 0,
    },
  },
  "affiliates.program": {
    schema: affiliateProgramSchema,
    defaults: {
      enabled: true,
      commissionBps: 2_500,
      commissionMonths: 12,
      cookieDays: 60,
      approvalDays: 7,
      minPayoutCents: 5_000,
      payoutDayOfMonth: 1,
      promoDiscountBps: 2_000,
      promoDiscountMonths: 3,
      agencyReferralFreeMonths: 1,
      manualApproval: true,
      reviewThresholdCents: 100_000,
      payoutMode: "request",
      payoutMethods: { stripe: true, bank_transfer: true, paypal: false },
      tiers: [
        { name: "Partner", minPayingAgencies: 0, commissionBps: 2_500, perks: "" },
        { name: "Pro", minPayingAgencies: 5, commissionBps: 3_000, perks: "" },
        { name: "Elite", minPayingAgencies: 20, commissionBps: 3_500, perks: "Co-marketing listing" },
      ],
    },
  },
  "billing.defaults": {
    schema: billingDefaultsSchema,
    defaults: { graceDays: 7, trialPlanKey: "pro" },
  },
  "payments.methods": {
    schema: paymentMethodsSchema,
    defaults: { online: true, bankTransfer: true, cash: true, confirmWithinDays: 5, sendReceipts: true },
  },
  "bookings.defaults": {
    schema: bookingDefaultsSchema,
    defaults: {
      quoteExpiryDays: 14,
      depositBps: 3_000,
      balanceDueDaysBeforeEvent: 14,
      payoutDisputeWindowDays: 3,
      vatRatesBps: [2_100, 900, 0],
    },
  },
} as const satisfies Record<string, { schema: z.ZodType; defaults: unknown }>;

export type SettingKey = keyof typeof settingsRegistry;
export type SettingValue<K extends SettingKey> = z.infer<(typeof settingsRegistry)[K]["schema"]>;
export const settingKeys = Object.keys(settingsRegistry) as SettingKey[];

/** Validates a stored value, falling back to the default if it no longer fits the schema. */
export function parseSetting<K extends SettingKey>(key: K, stored: unknown): SettingValue<K> {
  const entry = settingsRegistry[key];
  const result = entry.schema.safeParse(stored ?? entry.defaults);
  return (result.success ? result.data : entry.schema.parse(entry.defaults)) as SettingValue<K>;
}

export function validateSetting<K extends SettingKey>(key: K, value: unknown): SettingValue<K> {
  return settingsRegistry[key].schema.parse(value) as SettingValue<K>;
}
