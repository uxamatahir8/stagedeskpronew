import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAffiliateByAdmin, deleteAffiliateByAdmin, getSetting, prisma, setAffiliateStatus, updateAffiliateByAdmin, updateSetting } from "@stagedesk/db";
import { reconcileAffiliatePromos, retireAffiliatePromo, syncAffiliatePromo } from "./affiliates";
import { fakeStripe } from "./test/fixtures";

/** A partner's Stripe promotion code follows the partner: approval, suspension, a new code, deletion. */
const run = `ap${Date.now().toString(36)}`;
let program: Awaited<ReturnType<typeof getSetting<"affiliates.program">>>;

beforeAll(async () => {
  program = await getSetting("affiliates.program");
  await updateSetting("affiliates.program", { ...program, promoDiscountBps: 1_000, promoDiscountMonths: 3 }, null);
});

afterAll(async () => {
  await updateSetting("affiliates.program", program, null);
  await prisma.affiliate.deleteMany({ where: { user: { email: { startsWith: run } } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: run } } });
  await prisma.$disconnect();
});

let n = 0;
async function partner() {
  const { affiliate } = await createAffiliateByAdmin({ name: "Partner", email: `${run}-${n++}@test.local`, code: null, website: null, commissionBps: null, locale: "nl" });
  return affiliate;
}
const promoOf = async (affiliateId: string) => (await prisma.affiliate.findUniqueOrThrow({ where: { id: affiliateId } })).stripePromotionCodeId;

describe("partner promotion codes", () => {
  it("is active only while the partner is approved", async () => {
    const { stripe, promos } = fakeStripe();
    const a = await partner();
    await setAffiliateStatus(a.id, "approved");
    const id = await syncAffiliatePromo(stripe, a.id);
    expect(promos.find((p) => p.id === id)?.active).toBe(true);

    await setAffiliateStatus(a.id, "suspended");
    await syncAffiliatePromo(stripe, a.id);
    expect(promos.find((p) => p.id === id)?.active).toBe(false);

    // Approved again: the same code comes back on, no second one.
    await setAffiliateStatus(a.id, "approved");
    expect(await syncAffiliatePromo(stripe, a.id)).toBe(id);
    expect(promos.filter((p) => p.metadata["affiliateId"] === a.id)).toHaveLength(1);
    expect(promos.find((p) => p.id === id)?.active).toBe(true);
  });

  it("switches the old code off when the partner's code changes", async () => {
    const { stripe, promos } = fakeStripe();
    const a = await partner();
    await setAffiliateStatus(a.id, "approved");
    const oldId = await syncAffiliatePromo(stripe, a.id);
    const fresh = await prisma.affiliate.findUniqueOrThrow({ where: { id: a.id } });
    await updateAffiliateByAdmin(a.id, { code: fresh.code, promoCode: `${fresh.promoCode}X`, website: null, pitch: null, commissionBps: null });
    const newId = await syncAffiliatePromo(stripe, a.id);
    expect(newId).not.toBe(oldId);
    expect(promos.find((p) => p.id === oldId)?.active).toBe(false);
    expect(promos.find((p) => p.id === newId)).toMatchObject({ active: true, code: `${fresh.promoCode}X` });
  });

  it("stops a deleted partner's code, and the daily job catches codes left behind", async () => {
    const { stripe, promos } = fakeStripe();
    const a = await partner();
    await setAffiliateStatus(a.id, "approved");
    const id = (await syncAffiliatePromo(stripe, a.id))!;
    await retireAffiliatePromo(stripe, id);
    await deleteAffiliateByAdmin(a.id);
    expect(promos.find((p) => p.id === id)?.active).toBe(false);

    // A partner deleted before this fix: its code is still on in Stripe.
    const b = await partner();
    await setAffiliateStatus(b.id, "approved");
    const leftover = (await syncAffiliatePromo(stripe, b.id))!;
    await deleteAffiliateByAdmin(b.id);
    expect(promos.find((p) => p.id === leftover)?.active).toBe(true);
    const result = await reconcileAffiliatePromos(stripe);
    expect(result.orphans).toBeGreaterThanOrEqual(1);
    expect(promos.find((p) => p.id === leftover)?.active).toBe(false);
  });
});
