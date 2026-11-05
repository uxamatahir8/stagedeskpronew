import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// No email leaves the tests; the links they would carry are made for real.
vi.mock("./deliver", () => ({ deliver: vi.fn(async () => ({ id: "stored", status: "stored" })), accepted: (r: { status: string }) => r.status !== "unstored" }));
vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));

import { agencyTakesRequests, grantPlan, prisma } from "@stagedesk/db";
// Not exported by the package: the plans every test database needs.
import { seedPlans } from "../../../../packages/db/src/seed-plans";
import { resendArtistSetup } from "./artist-account";
import { auth } from "./auth-config";
import { writeBlocked } from "./billing";
import { passwordSetupUrl, resetTokenUsable } from "./password-setup";

/**
 * The two rules that need the web layer: whether a lapsed subscription closes
 * booking requests (the request page and its action both ask writeBlocked), and
 * what an expired or used first-password link does, through Better Auth's endpoint.
 */
const run = `pr${Date.now().toString(36)}`;
const org = `${run}-org`;
const DAY = 86_400_000;
const PASSWORD = "Setup-test-2026-ok";

const tokenOf = (url: string) => new URL(url).searchParams.get("token")!;
const setPassword = (token: string) => auth.api.resetPassword({ body: { token, newPassword: PASSWORD } });

async function person(key: string) {
  const id = `${run}-${key}`;
  await prisma.user.create({ data: { id, name: id, email: `${id}@test.local`, locale: "nl" } });
  return { id, email: `${id}@test.local`, name: id, locale: "nl" };
}

beforeAll(async () => {
  await seedPlans(prisma);
  await prisma.organization.create({ data: { id: org, name: org, slug: org } });
  await grantPlan(org, "business");
}, 60_000);

afterAll(async () => {
  await prisma.subscription.deleteMany({ where: { organizationId: org } });
  await prisma.auditEvent.deleteMany({ where: { agencyId: org } });
  await prisma.organization.deleteMany({ where: { id: org } });
  await prisma.verification.deleteMany({ where: { value: { startsWith: run } } });
  await prisma.session.deleteMany({ where: { userId: { startsWith: run } } });
  await prisma.account.deleteMany({ where: { userId: { startsWith: run } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: run } } });
  await prisma.$disconnect();
});

describe("booking requests and a lapsed subscription", () => {
  const setSubscription = (data: Record<string, unknown>) => prisma.subscription.updateMany({ where: { organizationId: org }, data });

  it("stays open for a paying agency", async () => {
    await setSubscription({ status: "active", pastDueSince: null });
    expect(await agencyTakesRequests(org)).toBe(true);
    expect(await writeBlocked(org)).toBeNull();
  });

  it("stays open during the grace period after a failed payment", async () => {
    await setSubscription({ status: "past_due", pastDueSince: new Date() });
    expect(await writeBlocked(org)).toBeNull();
  });

  it("closes when the grace period is over", async () => {
    await setSubscription({ status: "past_due", pastDueSince: new Date(Date.now() - 365 * DAY) });
    expect(await writeBlocked(org)).toBe("readOnly");
  });

  it("closes for a cancelled subscription", async () => {
    await setSubscription({ status: "canceled", pastDueSince: null });
    expect(await writeBlocked(org)).toBe("readOnly");
  });

  it("closes when a trial ended long ago", async () => {
    await setSubscription({ status: "trialing", trialEndsAt: new Date(Date.now() - 365 * DAY) });
    expect(await writeBlocked(org)).toBe("readOnly");
    await setSubscription({ status: "active", trialEndsAt: null });
  });
});

describe("first-password links", () => {
  it("refuses an expired link, and a resend gives one that works", async () => {
    const user = await person("expired");
    const token = tokenOf(await passwordSetupUrl(user.id, "nl"));
    expect(await resetTokenUsable(token)).toBe(true);
    await prisma.verification.updateMany({ where: { identifier: `reset-password:${token}` }, data: { expiresAt: new Date(Date.now() - 1000) } });

    expect(await resetTokenUsable(token)).toBe(false);
    await expect(setPassword(token)).rejects.toBeDefined();
    expect(await prisma.account.count({ where: { userId: user.id, providerId: "credential" } })).toBe(0);

    expect(await resendArtistSetup(org, user)).toBe("accepted");
    const [fresh, ...others] = await prisma.verification.findMany({ where: { value: user.id } });
    expect(others).toHaveLength(0);
    await setPassword(fresh!.identifier.replace("reset-password:", ""));
    expect(await prisma.account.count({ where: { userId: user.id, providerId: "credential" } })).toBe(1);
  });

  it("works once", async () => {
    const user = await person("once");
    const token = tokenOf(await passwordSetupUrl(user.id, "nl"));
    await setPassword(token);
    await expect(setPassword(token)).rejects.toBeDefined();
  });

  it("confirms the address it was sent to", async () => {
    const user = await person("confirm");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified).toBe(false);
    await setPassword(tokenOf(await passwordSetupUrl(user.id, "nl")));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified).toBe(true);
  });

  it("can't be used for someone else's account by guessing", async () => {
    await expect(setPassword(randomUUID())).rejects.toBeDefined();
  });
});
