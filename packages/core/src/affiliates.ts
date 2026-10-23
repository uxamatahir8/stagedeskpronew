import { type BasisPoints, type Cents, percentOf } from "./money";
import type { SettingValue } from "./settings/registry";

export type AffiliateProgram = SettingValue<"affiliates.program">;

/** Name of the first-party cookie that remembers the last referral link. */
export const viaCookie = "sd_via";

/** Affiliate link codes: 3–24 lowercase letters and digits. Agency give-a-month codes start with "r-". */
export const affiliateCodePattern = /^[a-z0-9]{3,24}$/;
export const agencyCodePattern = /^r-[a-z0-9]{6}$/;
export const promoCodePattern = /^[A-Z0-9]{4,24}$/;

export function normalizeCode(value: string | null | undefined) {
  const code = (value ?? "").trim().toLowerCase();
  return affiliateCodePattern.test(code) || agencyCodePattern.test(code) ? code : null;
}

export function normalizePromoCode(value: string | null | undefined) {
  const code = (value ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return promoCodePattern.test(code) ? code : null;
}

/** Campaign labels from ?c=: short, URL-safe, lowercase. */
export function normalizeCampaign(value: string | null | undefined) {
  const c = (value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 48);
  return c || null;
}

export interface ViaVisit {
  code: string;
  campaign: string | null;
  at: Date;
}

export function formatViaCookie(visit: ViaVisit) {
  return [visit.code, visit.campaign ?? "", Math.floor(visit.at.getTime() / 1000)].join(".");
}

export function parseViaCookie(value: string | null | undefined): ViaVisit | null {
  const [rawCode, rawCampaign, rawAt] = (value ?? "").split(".");
  const code = normalizeCode(rawCode);
  const seconds = Number(rawAt);
  if (!code || !Number.isSafeInteger(seconds) || seconds <= 0) return null;
  return { code, campaign: normalizeCampaign(rawCampaign), at: new Date(seconds * 1000) };
}

/** Whether a remembered visit still counts at signup. */
export function withinCookieWindow(visit: ViaVisit, now: Date, cookieDays: number) {
  const age = now.getTime() - visit.at.getTime();
  return age >= 0 && age <= cookieDays * 86_400_000;
}

/** The highest tier the affiliate qualifies for by paying agencies. */
export function tierFor(tiers: Readonly<AffiliateProgram["tiers"]>, payingAgencies: number) {
  return [...tiers].sort((a, b) => b.minPayingAgencies - a.minPayingAgencies).find((t) => payingAgencies >= t.minPayingAgencies) ?? null;
}

/**
 * The terms frozen on a new referral: the affiliate's own rate if set, else
 * their tier's, else the program default.
 */
export function referralTerms(input: { program: AffiliateProgram; overrideBps: BasisPoints | null; payingAgencies: number }) {
  const tier = tierFor(input.program.tiers, input.payingAgencies);
  return {
    commissionBps: input.overrideBps ?? tier?.commissionBps ?? input.program.commissionBps,
    commissionMonths: input.program.commissionMonths,
  };
}

export function commissionFor(baseCents: Cents, bps: BasisPoints): Cents {
  return Math.max(0, percentOf(baseCents, bps));
}

/** Adds calendar months, clamping to the last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: Date, months: number) {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/** Commission is earned on invoices paid within `months` of the first paid invoice (null = lifetime). */
export function commissionWindowOpen(firstPaidAt: Date, paidAt: Date, months: number | null) {
  return months === null || paidAt.getTime() < addMonths(firstPaidAt, months).getTime();
}

/** Mailbox providers anyone can use, so a shared domain says nothing about who someone is. */
const publicMailDomains = new Set([
  "gmail.com", "googlemail.com", "hotmail.com", "hotmail.nl", "outlook.com", "outlook.nl", "live.com", "live.nl",
  "msn.com", "icloud.com", "me.com", "yahoo.com", "yahoo.nl", "ziggo.nl", "kpnmail.nl", "planet.nl", "home.nl",
  "hetnet.nl", "xs4all.nl", "proton.me", "protonmail.com", "gmx.com", "gmx.net",
]);

const domainOf = (email: string) => email.trim().toLowerCase().split("@")[1] ?? "";

/**
 * Fraud rule: an affiliate can't earn on their own agency. Returns the reason
 * the referral is refused, or null when it's fine.
 */
export function selfReferralReason(input: { referrerUserIds: string[]; referrerEmails: string[]; agencyUserId: string; agencyEmail: string }) {
  if (input.referrerUserIds.includes(input.agencyUserId)) return "same_user";
  const domain = domainOf(input.agencyEmail);
  if (domain && !publicMailDomains.has(domain) && input.referrerEmails.some((e) => domainOf(e) === domain)) return "same_domain";
  return null;
}

/** The next payout date on or after `now` (the payout day of this month or next month). */
export function nextPayoutDate(now: Date, dayOfMonth: number) {
  const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), dayOfMonth));
  if (thisMonth.getTime() >= Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) return thisMonth;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, dayOfMonth));
}
