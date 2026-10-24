import { randomBytes, randomUUID } from "node:crypto";
import {
  affiliateCodePattern,
  agencyCodePattern,
  nextPayoutDate,
  normalizeCampaign,
  normalizeCode,
  normalizePromoCode,
  referralTerms,
  selfReferralReason,
  tierFor,
  type ViaVisit,
  withinCookieWindow,
} from "@stagedesk/core";
import { prisma } from "./client";
import { notify } from "./notifications";
import { getSetting } from "./settings";

/** Commissions that count as earned (not cancelled). */
const earned = ["pending", "review", "approved", "requested", "paid"];

async function freeCode(base: string) {
  const clean = base.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20) || "partner";
  const stem = clean.length >= 3 ? clean : `${clean}partner`;
  for (let i = 1; i < 50; i++) {
    const code = i === 1 ? stem : `${stem}${i}`;
    if (!(await prisma.affiliate.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  return `${stem}${randomBytes(3).toString("hex")}`;
}

async function freePromoCode(code: string, discountBps: number) {
  const suffix = discountBps > 0 ? String(Math.round(discountBps / 100)) : "";
  for (let i = 1; i < 50; i++) {
    const promo = normalizePromoCode(`${code.slice(0, 18)}${i === 1 ? "" : i}${suffix}`) ?? `SD${randomBytes(3).toString("hex").toUpperCase()}`;
    if (!(await prisma.affiliate.findUnique({ where: { promoCode: promo }, select: { id: true } }))) return promo;
  }
  return `SD${randomBytes(4).toString("hex").toUpperCase()}`;
}

/**
 * Turns a user into an affiliate applicant (or an approved affiliate when the
 * program doesn't need manual approval). The user's platform role becomes
 * "affiliate" so they land on the affiliate dashboard.
 */
export async function applyForAffiliate(input: { userId: string; name: string; website: string | null; pitch: string | null; wantedCode: string | null }) {
  const program = await getSetting("affiliates.program");
  const wanted = input.wantedCode && affiliateCodePattern.test(input.wantedCode) ? input.wantedCode : input.name;
  const code = await freeCode(wanted);
  const promoCode = await freePromoCode(code.toUpperCase(), program.promoDiscountBps);
  const status = program.manualApproval ? "pending" : "approved";
  const [affiliate] = await prisma.$transaction([
    prisma.affiliate.create({
      data: {
        id: randomUUID(),
        userId: input.userId,
        code,
        promoCode,
        website: input.website,
        pitch: input.pitch,
        status,
        approvedAt: status === "approved" ? new Date() : null,
      },
    }),
    prisma.user.update({ where: { id: input.userId }, data: { platformRole: "affiliate" } }),
  ]);
  return affiliate;
}

export async function setAffiliateStatus(affiliateId: string, status: "approved" | "rejected" | "suspended", now = new Date()) {
  const current = await prisma.affiliate.findUniqueOrThrow({ where: { id: affiliateId } });
  return prisma.affiliate.update({
    where: { id: affiliateId },
    data: { status, approvedAt: status === "approved" ? (current.approvedAt ?? now) : current.approvedAt },
    include: { user: { select: { email: true, name: true, locale: true } } },
  });
}

/** An agency's give-a-month code, created on first use. */
export async function agencyReferralCode(organizationId: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { referralCode: true } });
  if (org.referralCode) return org.referralCode;
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = `r-${Array.from(randomBytes(6), (b) => alphabet[b % alphabet.length]).join("")}`;
    try {
      const { count } = await prisma.organization.updateMany({ where: { id: organizationId, referralCode: null }, data: { referralCode: code } });
      if (count === 1) return code;
    } catch {
      // Code already taken by another agency: try another.
    }
    const again = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { referralCode: true } });
    if (again.referralCode) return again.referralCode;
  }
  throw new Error("Could not create a referral code");
}

/** Logs a click on an approved affiliate's link. Agency codes aren't counted. */
export async function recordAffiliateClick(input: { code: string; campaign: string | null; landingPath: string | null; visitorHash: string | null }) {
  const code = normalizeCode(input.code);
  if (!code || !affiliateCodePattern.test(code)) return false;
  const affiliate = await prisma.affiliate.findUnique({ where: { code }, select: { id: true, status: true } });
  if (affiliate?.status !== "approved") return false;
  await prisma.affiliateClick.create({
    data: {
      affiliateId: affiliate.id,
      campaign: normalizeCampaign(input.campaign),
      landingPath: input.landingPath?.slice(0, 191) ?? null,
      visitorHash: input.visitorHash,
    },
  });
  return true;
}

export async function payingAgencyCount(affiliateId: string) {
  return prisma.referral.count({ where: { affiliateId, status: "active", firstPaidAt: { not: null } } });
}

type Referrer =
  | { type: "affiliate"; affiliate: { id: string; userId: string; commissionBps: number | null; user: { email: string } } }
  | { type: "agency"; agency: { id: string; members: { userId: string; user: { email: string } }[] } };

async function findReferrer(input: { code?: string; promoCode?: string }): Promise<Referrer | null> {
  const affiliateSelect = { id: true, userId: true, commissionBps: true, status: true, user: { select: { email: true } } } as const;
  if (input.promoCode) {
    const affiliate = await prisma.affiliate.findUnique({ where: { promoCode: input.promoCode }, select: affiliateSelect });
    return affiliate?.status === "approved" ? { type: "affiliate", affiliate } : null;
  }
  const code = input.code ?? "";
  if (agencyCodePattern.test(code)) {
    const agency = await prisma.organization.findUnique({
      where: { referralCode: code },
      select: { id: true, members: { select: { userId: true, user: { select: { email: true } } } } },
    });
    return agency ? { type: "agency", agency } : null;
  }
  const affiliate = await prisma.affiliate.findUnique({ where: { code }, select: affiliateSelect });
  return affiliate?.status === "approved" ? { type: "affiliate", affiliate } : null;
}

/**
 * Records who brought a new agency in. A promo code typed at signup beats the
 * link cookie; the cookie only counts within the program's window. Referrals
 * caught by a fraud rule are kept as "rejected" so the admin can see them.
 */
export async function attachReferral(input: {
  agencyId: string;
  ownerUserId: string;
  ownerEmail: string;
  visit: ViaVisit | null;
  promoCode: string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const program = await getSetting("affiliates.program");
  if (await prisma.referral.findUnique({ where: { agencyId: input.agencyId }, select: { id: true } })) return null;

  const promo = normalizePromoCode(input.promoCode);
  const visit = input.visit && withinCookieWindow(input.visit, now, program.cookieDays) ? input.visit : null;
  const referrer = (promo ? await findReferrer({ promoCode: promo }) : null) ?? (visit ? await findReferrer({ code: visit.code }) : null);
  if (!referrer) return null;
  const source = promo && referrer.type === "affiliate" ? "promo_code" : "cookie";
  if (referrer.type === "affiliate" && !program.enabled) return null;
  if (referrer.type === "agency" && program.agencyReferralFreeMonths === 0) return null;

  const reason =
    referrer.type === "affiliate"
      ? selfReferralReason({
          referrerUserIds: [referrer.affiliate.userId],
          referrerEmails: [referrer.affiliate.user.email],
          agencyUserId: input.ownerUserId,
          agencyEmail: input.ownerEmail,
        })
      : referrer.agency.id === input.agencyId
        ? "same_user"
        : selfReferralReason({
            referrerUserIds: referrer.agency.members.map((m) => m.userId),
            referrerEmails: referrer.agency.members.map((m) => m.user.email),
            agencyUserId: input.ownerUserId,
            agencyEmail: input.ownerEmail,
          });

  const terms =
    referrer.type === "affiliate"
      ? referralTerms({ program, overrideBps: referrer.affiliate.commissionBps, payingAgencies: await payingAgencyCount(referrer.affiliate.id) })
      : { commissionBps: 0, commissionMonths: null };

  return prisma.referral.create({
    data: {
      id: randomUUID(),
      agencyId: input.agencyId,
      type: referrer.type,
      affiliateId: referrer.type === "affiliate" ? referrer.affiliate.id : null,
      referringAgencyId: referrer.type === "agency" ? referrer.agency.id : null,
      source,
      campaign: source === "cookie" ? (visit?.campaign ?? null) : null,
      commissionBps: terms.commissionBps,
      commissionMonths: terms.commissionMonths,
      status: reason ? "rejected" : "active",
      rejectReason: reason,
      createdAt: now,
    },
  });
}

/**
 * A promo code used at Stripe Checkout overrides a cookie referral, as long
 * as nothing has been earned on the old one yet.
 */
export async function overrideReferralWithPromo(agencyId: string, affiliateId: string, now = new Date()) {
  const program = await getSetting("affiliates.program");
  const affiliate = await prisma.affiliate.findUnique({ where: { id: affiliateId }, include: { user: { select: { email: true } } } });
  if (affiliate?.status !== "approved") return null;
  const existing = await prisma.referral.findUnique({ where: { agencyId }, include: { _count: { select: { commissions: true } } } });
  if (existing && (existing.affiliateId === affiliateId || existing._count.commissions > 0)) return existing;
  const owner = await prisma.member.findFirst({ where: { organizationId: agencyId, role: "agency_owner" }, include: { user: { select: { email: true } } } });
  const reason = owner
    ? selfReferralReason({ referrerUserIds: [affiliate.userId], referrerEmails: [affiliate.user.email], agencyUserId: owner.userId, agencyEmail: owner.user.email })
    : null;
  const terms = referralTerms({ program, overrideBps: affiliate.commissionBps, payingAgencies: await payingAgencyCount(affiliate.id) });
  const data = {
    type: "affiliate",
    affiliateId,
    referringAgencyId: null,
    source: "promo_code",
    campaign: null,
    commissionBps: terms.commissionBps,
    commissionMonths: terms.commissionMonths,
    status: reason ? "rejected" : "active",
    rejectReason: reason,
  };
  return existing
    ? prisma.referral.update({ where: { id: existing.id }, data })
    : prisma.referral.create({ data: { id: randomUUID(), agencyId, createdAt: now, ...data } });
}

/**
 * Pending commissions whose approval window has passed become approved.
 * An affiliate whose month is unusually large waits for manual review.
 */
export async function approveDueCommissions(now = new Date()) {
  const program = await getSetting("affiliates.program");
  const due = await prisma.commission.findMany({ where: { status: "pending", availableAt: { lte: now } } });
  let approved = 0;
  let review = 0;
  for (const c of due) {
    const monthStart = new Date(Date.UTC(c.createdAt.getUTCFullYear(), c.createdAt.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(c.createdAt.getUTCFullYear(), c.createdAt.getUTCMonth() + 1, 1));
    const month = await prisma.commission.aggregate({
      where: { affiliateId: c.affiliateId, status: { in: earned }, createdAt: { gte: monthStart, lt: monthEnd } },
      _sum: { amountCents: true },
    });
    const large = program.reviewThresholdCents > 0 && (month._sum.amountCents ?? 0) > program.reviewThresholdCents;
    await prisma.commission.update({ where: { id: c.id, status: "pending" }, data: { status: large ? "review" : "approved" } });
    if (large) review++;
    else {
      approved++;
      const affiliate = await prisma.affiliate.findUnique({ where: { id: c.affiliateId }, select: { userId: true } });
      await notify([affiliate?.userId], { type: "commission_approved", data: { cents: c.amountCents }, url: "/app/payouts" });
    }
  }
  return { approved, review };
}

/** Admin decision on a commission held for review. */
export async function reviewCommission(commissionId: string, approve: boolean) {
  return prisma.commission.update({
    where: { id: commissionId, status: "review" },
    data: approve ? { status: "approved" } : { status: "cancelled", cancelReason: "review_rejected" },
  });
}

/** Everything the affiliate dashboard shows. */
export async function affiliateOverview(affiliateId: string, now = new Date()) {
  const program = await getSetting("affiliates.program");
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [affiliate, clicksTotal, clicksMonth, clicksByCampaign, referrals, sums, payouts] = await Promise.all([
    prisma.affiliate.findUniqueOrThrow({ where: { id: affiliateId } }),
    prisma.affiliateClick.count({ where: { affiliateId } }),
    prisma.affiliateClick.count({ where: { affiliateId, createdAt: { gte: monthStart } } }),
    prisma.affiliateClick.groupBy({ by: ["campaign"], where: { affiliateId }, _count: { _all: true } }),
    prisma.referral.findMany({
      where: { affiliateId, status: "active" },
      select: { campaign: true, firstPaidAt: true, createdAt: true, agency: { select: { name: true, subscription: { select: { status: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.commission.groupBy({ by: ["status"], where: { affiliateId }, _sum: { amountCents: true } }),
    prisma.affiliatePayout.findMany({ where: { affiliateId }, orderBy: { createdAt: "desc" }, take: 24 }),
  ]);
  const sum = (status: string) => sums.find((s) => s.status === status)?._sum.amountCents ?? 0;
  const paying = referrals.filter((r) => r.firstPaidAt && ["active", "past_due"].includes(r.agency.subscription?.status ?? "")).length;
  const everPaid = referrals.filter((r) => r.firstPaidAt).length;
  const trials = referrals.filter((r) => r.agency.subscription?.status === "trialing").length;

  const campaigns = new Map<string, { clicks: number; signups: number; paying: number }>();
  const row = (c: string | null) => {
    const key = c ?? "";
    if (!campaigns.has(key)) campaigns.set(key, { clicks: 0, signups: 0, paying: 0 });
    return campaigns.get(key)!;
  };
  for (const c of clicksByCampaign) row(c.campaign).clicks += c._count._all;
  for (const r of referrals) {
    row(r.campaign).signups++;
    if (r.firstPaidAt) row(r.campaign).paying++;
  }

  const tier = tierFor(program.tiers, everPaid);
  const nextTier = [...program.tiers].sort((a, b) => a.minPayingAgencies - b.minPayingAgencies).find((t) => t.minPayingAgencies > everPaid) ?? null;
  const approved = sum("approved");
  return {
    affiliate,
    program,
    funnel: { clicksTotal, clicksMonth, signups: referrals.length, trials, paying, everPaid },
    campaigns: [...campaigns.entries()].map(([campaign, v]) => ({ campaign: campaign || null, ...v })).sort((a, b) => b.clicks - a.clicks),
    referrals,
    earnings: { pending: sum("pending") + sum("review"), approved, paid: sum("paid") },
    nextPayout: { date: nextPayoutDate(now, program.payoutDayOfMonth), amountCents: approved >= program.minPayoutCents ? approved : 0 },
    tier,
    nextTier,
    commissionBps: affiliate.commissionBps ?? tier?.commissionBps ?? program.commissionBps,
    payouts,
  };
}

export class AffiliateAdminError extends Error {
  constructor(readonly code: "code_taken" | "promo_taken" | "has_history" | "is_admin" | "already_partner" | "not_found") {
    super(`Affiliate: ${code}`);
    this.name = "AffiliateAdminError";
  }
}

/**
 * The platform admin adds a partner directly (no application needed). An
 * account is created for a new email; they sign in with an emailed code.
 */
export async function createAffiliateByAdmin(input: { name: string; email: string; code: string | null; website: string | null; commissionBps: number | null; locale: "nl" | "en" }) {
  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email }, include: { affiliate: { select: { id: true } } } });
  if (existing?.platformRole === "platform_admin") throw new AffiliateAdminError("is_admin");
  if (existing?.affiliate) throw new AffiliateAdminError("already_partner");
  if (input.code && (await prisma.affiliate.findUnique({ where: { code: input.code }, select: { id: true } }))) throw new AffiliateAdminError("code_taken");
  const userId = existing?.id ?? randomUUID();
  if (!existing) await prisma.user.create({ data: { id: userId, name: input.name.trim(), email, locale: input.locale } });
  const program = await getSetting("affiliates.program");
  const code = await freeCode(input.code ?? input.name);
  const promoCode = await freePromoCode(code.toUpperCase(), program.promoDiscountBps);
  const [affiliate] = await prisma.$transaction([
    prisma.affiliate.create({
      data: { id: randomUUID(), userId, code, promoCode, website: input.website, commissionBps: input.commissionBps, status: "approved", approvedAt: new Date() },
      include: { user: { select: { email: true, name: true, locale: true } } },
    }),
    prisma.user.update({ where: { id: userId }, data: { platformRole: "affiliate" } }),
  ]);
  return { affiliate, newUser: !existing };
}

/** Edits a partner's link code, promo code and details. A changed promo code is re-created in Stripe. */
export async function updateAffiliateByAdmin(affiliateId: string, input: { code: string; promoCode: string; website: string | null; pitch: string | null; commissionBps: number | null }) {
  const current = await prisma.affiliate.findUnique({ where: { id: affiliateId } });
  if (!current) throw new AffiliateAdminError("not_found");
  if (input.code !== current.code && (await prisma.affiliate.findUnique({ where: { code: input.code }, select: { id: true } }))) throw new AffiliateAdminError("code_taken");
  if (input.promoCode !== current.promoCode && (await prisma.affiliate.findUnique({ where: { promoCode: input.promoCode }, select: { id: true } }))) throw new AffiliateAdminError("promo_taken");
  return prisma.affiliate.update({
    where: { id: affiliateId },
    data: {
      code: input.code,
      promoCode: input.promoCode,
      website: input.website,
      pitch: input.pitch,
      commissionBps: input.commissionBps,
      // The old Stripe promotion code no longer matches; it's created again on the next sync.
      ...(input.promoCode !== current.promoCode ? { stripePromotionCodeId: null } : {}),
    },
  });
}

/**
 * Removes a partner who never brought anyone in (no referrals, commission or
 * payouts). Partners with history are paused instead, so the books stay whole.
 */
export async function deleteAffiliateByAdmin(affiliateId: string) {
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
    include: { _count: { select: { referrals: true, commissions: true, payouts: true } } },
  });
  if (!affiliate) throw new AffiliateAdminError("not_found");
  const c = affiliate._count;
  if (c.referrals + c.commissions + c.payouts > 0) throw new AffiliateAdminError("has_history");
  await prisma.$transaction([
    prisma.affiliate.delete({ where: { id: affiliateId } }),
    prisma.user.update({ where: { id: affiliate.userId }, data: { platformRole: null } }),
  ]);
  return affiliate;
}
