import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "./client";
import { finishCampaignIfDone, isTemporaryMailError, markDelivery, NEWSLETTER_MAX_ATTEMPTS, nextDeliveries, retryFailedDeliveries, startCampaign } from "./newsletter";
import { claimReminder, withReminder } from "./reminders";

/** Newsletter deliveries and reminders when sending fails or runs twice at once. */
const run = `dr${Date.now().toString(36)}`;
const campaigns: string[] = [];

afterAll(async () => {
  await prisma.newsletterCampaign.deleteMany({ where: { id: { in: campaigns } } });
  await prisma.newsletterSubscriber.deleteMany({ where: { email: { startsWith: run } } });
  await prisma.reminderLog.deleteMany({ where: { key: { startsWith: run } } });
  await prisma.$disconnect();
});

/** A campaign to exactly `count` new subscribers (audience by a locale nobody else uses is not available, so the run's own subscribers are matched by email). */
async function campaign(count: number) {
  const id = `${run}-c${campaigns.length}`;
  campaigns.push(id);
  const subscribers = Array.from({ length: count }, (_, i) => ({ id: randomUUID(), email: `${run}-${campaigns.length}-${i}@test.local`, locale: "nl", status: "subscribed", token: randomUUID() }));
  await prisma.newsletterSubscriber.createMany({ data: subscribers });
  await prisma.newsletterCampaign.create({ data: { id, subjectNl: "Nieuws", subjectEn: "News", bodyNl: "", bodyEn: "", articleIds: [], audience: "all", status: "sending", startedAt: new Date() } });
  await prisma.newsletterDelivery.createMany({ data: subscribers.map((s) => ({ id: randomUUID(), campaignId: id, subscriberId: s.id })) });
  return id;
}

describe("newsletter deliveries", () => {
  it("never hands one delivery to two senders at once", async () => {
    const id = await campaign(20);
    const [a, b] = await Promise.all([nextDeliveries(id, 20), nextDeliveries(id, 20)]);
    const ids = [...a, ...b].map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(20);
    // Claimed ones aren't handed out again while the claim holds.
    expect(await nextDeliveries(id, 20)).toHaveLength(0);
  });

  it("retries a temporary failure later and gives up after the last attempt", async () => {
    const id = await campaign(1);
    let now = new Date();
    for (let attempt = 1; attempt <= NEWSLETTER_MAX_ATTEMPTS; attempt++) {
      const [d] = await nextDeliveries(id, 10, now);
      expect(d).toBeDefined();
      const outcome = await markDelivery(d!.id, id, { ok: false, error: "421 try later", temporary: true }, now);
      expect(outcome).toBe(attempt < NEWSLETTER_MAX_ATTEMPTS ? "retry" : "failed");
      // Not handed out again until its pause is over.
      expect(await nextDeliveries(id, 10, now)).toHaveLength(0);
      now = new Date(now.getTime() + 3 * 60 * 60_000);
    }
    expect(await finishCampaignIfDone(id)).toBe(true);
    const c = await prisma.newsletterCampaign.findUniqueOrThrow({ where: { id } });
    expect(c).toMatchObject({ status: "sent", failedCount: 1, sentCount: 0 });

    // The admin fixes the SMTP settings and queues the failures again.
    expect(await retryFailedDeliveries(id)).toBe(1);
    expect(await prisma.newsletterCampaign.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "sending", failedCount: 0 });
    const [again] = await nextDeliveries(id, 10);
    await markDelivery(again!.id, id, { ok: true });
    expect(await finishCampaignIfDone(id)).toBe(true);
    expect(await prisma.newsletterCampaign.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "sent", sentCount: 1 });
  });

  it("doesn't retry a permanent rejection", async () => {
    expect(isTemporaryMailError({ responseCode: 550 })).toBe(false);
    expect(isTemporaryMailError({ responseCode: 421 })).toBe(true);
    expect(isTemporaryMailError(new Error("ECONNREFUSED"))).toBe(true);
    const id = await campaign(1);
    const [d] = await nextDeliveries(id, 10);
    expect(await markDelivery(d!.id, id, { ok: false, error: "550 no such user", temporary: false })).toBe("failed");
  });

  it("starting a campaign twice doesn't duplicate its recipients", async () => {
    const id = await campaign(0);
    await prisma.newsletterCampaign.update({ where: { id }, data: { status: "draft" } });
    await prisma.newsletterSubscriber.create({ data: { id: randomUUID(), email: `${run}-solo@test.local`, locale: "nl", status: "subscribed", token: randomUUID() } });
    await Promise.allSettled([startCampaign(id), startCampaign(id)]);
    const counts = await prisma.newsletterDelivery.groupBy({ by: ["subscriberId"], where: { campaignId: id }, _count: { _all: true } });
    expect(counts.every((c) => c._count._all === 1)).toBe(true);
  });
});

describe("reminders", () => {
  it("gives the claim back when queuing fails, so the next run sends it", async () => {
    const key = `${run}-r1`;
    await expect(
      withReminder(key, async () => {
        throw new Error("Redis down");
      }),
    ).rejects.toThrow("Redis down");
    let queued = 0;
    expect(
      await withReminder(key, async () => {
        queued++;
      }),
    ).toBe(true);
    // And never twice once it went through.
    expect(await withReminder(key, async () => void queued++)).toBe(false);
    expect(queued).toBe(1);
    expect(await claimReminder(key)).toBe(false);
  });
});
