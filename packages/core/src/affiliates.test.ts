import { describe, expect, it } from "vitest";
import {
  addMonths,
  commissionFor,
  commissionWindowOpen,
  formatViaCookie,
  nextPayoutDate,
  normalizeCode,
  normalizePromoCode,
  parseViaCookie,
  referralTerms,
  selfReferralReason,
  tierFor,
  withinCookieWindow,
} from "./affiliates";
import { parseSetting } from "./settings/registry";

const program = parseSetting("affiliates.program", undefined);

describe("referral codes and cookie", () => {
  it("accepts affiliate and agency codes, refuses anything else", () => {
    expect(normalizeCode(" Pim ")).toBe("pim");
    expect(normalizeCode("r-k7q2m9")).toBe("r-k7q2m9");
    expect(normalizeCode("a")).toBeNull();
    expect(normalizeCode("pim<script>")).toBeNull();
    expect(normalizePromoCode("pim 20")).toBe("PIM20");
    expect(normalizePromoCode("x")).toBeNull();
  });

  it("round-trips the cookie and expires it after the window", () => {
    const at = new Date("2026-09-01T10:00:00Z");
    const visit = parseViaCookie(formatViaCookie({ code: "pim", campaign: "instagram", at }))!;
    expect(visit).toEqual({ code: "pim", campaign: "instagram", at });
    expect(withinCookieWindow(visit, new Date("2026-10-30T10:00:00Z"), 60)).toBe(true);
    expect(withinCookieWindow(visit, new Date("2026-11-01T10:00:00Z"), 60)).toBe(false);
    expect(parseViaCookie("pim..notanumber")).toBeNull();
    expect(parseViaCookie(formatViaCookie({ code: "pim", campaign: null, at }))?.campaign).toBeNull();
  });
});

describe("commission terms", () => {
  it("picks the highest tier reached", () => {
    expect(tierFor(program.tiers, 0)?.name).toBe("Partner");
    expect(tierFor(program.tiers, 5)?.name).toBe("Pro");
    expect(tierFor(program.tiers, 25)?.name).toBe("Elite");
  });

  it("uses the affiliate's own rate over their tier", () => {
    expect(referralTerms({ program, overrideBps: null, payingAgencies: 6 })).toEqual({ commissionBps: 3_000, commissionMonths: 12 });
    expect(referralTerms({ program, overrideBps: 4_000, payingAgencies: 6 }).commissionBps).toBe(4_000);
    expect(referralTerms({ program: { ...program, tiers: [] }, overrideBps: null, payingAgencies: 0 }).commissionBps).toBe(2_500);
  });

  it("calculates commission in whole cents", () => {
    expect(commissionFor(6_900, 2_500)).toBe(1_725);
    expect(commissionFor(5_702, 2_500)).toBe(1_426);
  });

  it("counts calendar months from the first paid invoice", () => {
    const first = new Date("2026-01-31T12:00:00Z");
    expect(addMonths(first, 1).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(commissionWindowOpen(first, new Date("2027-01-30T12:00:00Z"), 12)).toBe(true);
    expect(commissionWindowOpen(first, new Date("2027-01-31T12:00:00Z"), 12)).toBe(false);
    expect(commissionWindowOpen(first, new Date("2040-01-01"), null)).toBe(true);
  });
});

describe("fraud rules", () => {
  const referrer = { referrerUserIds: ["u1"], referrerEmails: ["pim@feestpartners.nl"] };
  it("refuses the affiliate's own agency and their company domain", () => {
    expect(selfReferralReason({ ...referrer, agencyUserId: "u1", agencyEmail: "x@y.nl" })).toBe("same_user");
    expect(selfReferralReason({ ...referrer, agencyUserId: "u2", agencyEmail: "info@feestpartners.nl" })).toBe("same_domain");
  });
  it("ignores shared mailbox providers", () => {
    const gmail = { referrerUserIds: ["u1"], referrerEmails: ["pim@gmail.com"] };
    expect(selfReferralReason({ ...gmail, agencyUserId: "u2", agencyEmail: "dj@gmail.com" })).toBeNull();
  });
});

describe("payout schedule", () => {
  it("is the payout day this month, or next month once it has passed", () => {
    expect(nextPayoutDate(new Date("2026-10-01T15:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(nextPayoutDate(new Date("2026-10-22T09:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-11-01");
  });
});
