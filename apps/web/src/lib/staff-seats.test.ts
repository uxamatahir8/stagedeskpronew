import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// No email leaves the tests: invitations, verification links and the like are only recorded.
vi.mock("./deliver", () => ({ deliver: vi.fn() }));

import { grantPlan, prisma } from "@stagedesk/db";
// Not exported by the package: the plans every test database needs.
import { seedPlans } from "../../../../packages/db/src/seed-plans";
import { auth } from "./auth-config";
import { deliver } from "./deliver";

/**
 * Staff seats (`maxStaff`) through Better Auth's real endpoints: its own
 * permission checks, our organization hooks, and its own database writes.
 * Starter has 2 seats; the owner takes one. Where a race needs a precise
 * interleaving, one of Better Auth's writes is held at a known point
 * (`intercept`), so the test doesn't depend on timing.
 */
const run = `seatapi${Date.now().toString(36)}`;
const PASSWORD = "Seats-test-2026-ok";
const orgs: string[] = [];
let n = 0;

type Session = { userId: string; email: string; headers: Headers };

async function account(): Promise<Session> {
  const email = `${run}-${n++}@test.local`;
  await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: email } });
  await prisma.user.update({ where: { email }, data: { emailVerified: true } });
  const signedIn = await auth.api.signInEmail({ body: { email, password: PASSWORD }, returnHeaders: true });
  const cookie = signedIn.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { userId: signedIn.response.user.id, email, headers: new Headers({ cookie }) };
}

async function agency() {
  const id = `${run}-org${orgs.length}`;
  await prisma.organization.create({ data: { id, name: id, slug: id } });
  orgs.push(id);
  await grantPlan(id, "starter");
  const owner = await account();
  await prisma.member.create({ data: { id: randomUUID(), organizationId: id, userId: owner.userId, role: "agency_owner" } });
  return { id, owner };
}
type Agency = Awaited<ReturnType<typeof agency>>;

async function member(organizationId: string, role: string) {
  const userId = `${run}-u${n++}`;
  await prisma.user.create({ data: { id: userId, name: userId, email: `${userId}@test.local` } });
  return prisma.member.create({ data: { id: randomUUID(), organizationId, userId, role } });
}

const setRole = (a: Agency, memberId: string, role: string) => auth.api.updateMemberRole({ headers: a.owner.headers, body: { memberId, role, organizationId: a.id } });
const invite = (a: Agency, email: string, resend = false) =>
  auth.api.createInvitation({ headers: a.owner.headers, body: { email, role: "agency_staff", organizationId: a.id, resend } });

const roleOf = async (id: string) => (await prisma.member.findUnique({ where: { id } }))?.role ?? null;
/** Seats held by members: owners, admins and staff. */
const staffMembers = (organizationId: string) => prisma.member.count({ where: { organizationId, role: { in: ["agency_owner", "agency_admin", "agency_staff"] } } });
/** Seats in use by the billing rule: staff members plus pending staff invitations. */
async function seatsUsed(organizationId: string) {
  const pending = await prisma.invitation.count({ where: { organizationId, status: "pending", role: { in: ["agency_admin", "agency_staff"] }, expiresAt: { gt: new Date() } } });
  return (await staffMembers(organizationId)) + pending;
}
const seatsFull = { body: { code: "STAFF_SEATS_FULL" } };

/**
 * Holds the next call of `delegate[method]` whose first argument matches:
 * "before" stops it before it reaches the database (and can make it fail),
 * "after" lets it write and stops it before it returns.
 */
function intercept<T extends object>(delegate: T, method: keyof T & string, match: (arg: never) => boolean, mode: "before" | "after") {
  const target = delegate as Record<string, (...args: unknown[]) => Promise<unknown>>;
  const original = target[method]!;
  let reachedResolve!: () => void;
  let releaseResolve!: (how: "go" | "fail") => void;
  const reached = new Promise<void>((r) => (reachedResolve = r));
  const release = new Promise<"go" | "fail">((r) => (releaseResolve = r));
  let armed = true;
  target[method] = async (...args: unknown[]) => {
    if (!armed || !match(args[0] as never)) return original.apply(delegate, args);
    armed = false;
    if (mode === "after") {
      const result = await original.apply(delegate, args);
      reachedResolve();
      await release;
      return result;
    }
    reachedResolve();
    if ((await release) === "fail") throw new Error("Simulated database failure");
    return original.apply(delegate, args);
  };
  return {
    reached,
    go: () => releaseResolve("go"),
    fail: () => releaseResolve("fail"),
    restore: () => {
      target[method] = original;
    },
  };
}

beforeAll(async () => {
  await seedPlans(prisma);
});

beforeEach(() => {
  vi.mocked(deliver).mockClear();
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: run } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: run } } });
});

describe("staff seats through Better Auth's API", () => {
  it("promotes while a seat is free and refuses at the limit without changing anything", async () => {
    const a = await agency();
    const first = await member(a.id, "artist");
    const second = await member(a.id, "artist");
    await setRole(a, first.id, "agency_staff");
    expect(await roleOf(first.id)).toBe("agency_staff");
    await expect(setRole(a, second.id, "agency_admin")).rejects.toMatchObject(seatsFull);
    expect(await roleOf(second.id)).toBe("artist");
    // Staff to admin keeps its seat; back to artist frees it.
    await setRole(a, first.id, "agency_admin");
    await setRole(a, first.id, "artist");
    await setRole(a, second.id, "agency_staff");
    expect(await staffMembers(a.id)).toBe(2);
  });

  it("can't be pushed over the limit by a promotion whose write lands after other role changes", async () => {
    // Promotion A of X is held at Better Auth's own write; meanwhile X is set back to artist (B)
    // and Y is promoted (C). When A's write lands, X and Y can't both keep a seat.
    const a = await agency();
    const x = await member(a.id, "artist");
    const y = await member(a.id, "artist");
    const held = intercept(prisma.member, "update", (arg: { where: { id?: string }; data: { role?: string } }) => arg.where.id === x.id && arg.data.role === "agency_staff", "before");
    try {
      const promotion = setRole(a, x.id, "agency_staff").then(
        () => "ok",
        (e: unknown) => e,
      );
      await held.reached;
      await setRole(a, x.id, "artist");
      await setRole(a, y.id, "agency_staff");
      held.go();
      // A's write landed last: its check finds the seats over and undoes it.
      expect(await promotion).toMatchObject(seatsFull);
    } finally {
      held.restore();
    }
    expect(await roleOf(x.id)).toBe("artist");
    expect(await roleOf(y.id)).toBe("agency_staff");
    expect(await staffMembers(a.id)).toBe(2);
  });

  it("leaves no role change behind when Better Auth's write fails", async () => {
    const a = await agency();
    const x = await member(a.id, "artist");
    const held = intercept(prisma.member, "update", (arg: { where: { id?: string } }) => arg.where.id === x.id, "before");
    try {
      const promotion = setRole(a, x.id, "agency_staff").then(
        () => "ok",
        (e: unknown) => e,
      );
      await held.reached;
      held.fail();
      expect(await promotion).not.toBe("ok");
    } finally {
      held.restore();
    }
    expect(await roleOf(x.id)).toBe("artist");
  });

  it("gives the last seat to one of several simultaneous promotions", async () => {
    const a = await agency();
    const artists = await Promise.all([1, 2, 3, 4].map(() => member(a.id, "artist")));
    const results = await Promise.allSettled(artists.map((m) => setRole(a, m.id, "agency_staff")));
    const promoted = results.filter((r) => r.status === "fulfilled").length;
    expect(promoted).toBe(1);
    expect(await staffMembers(a.id)).toBe(1 + promoted);
    for (const [i, r] of results.entries()) {
      if (r.status === "rejected") {
        expect(r.reason).toMatchObject(seatsFull);
        expect(await roleOf(artists[i]!.id)).toBe("artist");
      }
    }
  });

  it("never lets a promotion and a new invitation both take the last seat", async () => {
    for (let round = 0; round < 3; round++) {
      const a = await agency();
      const x = await member(a.id, "artist");
      const results = await Promise.allSettled([setRole(a, x.id, "agency_staff"), invite(a, `${run}-inv${n++}@test.local`)]);
      expect(results.filter((r) => r.status === "fulfilled").length).toBeLessThanOrEqual(1);
      expect(await seatsUsed(a.id)).toBeLessThanOrEqual(2);
    }
  });

  it("holds the limit while an invitation is being accepted", async () => {
    // Better Auth marks the invitation accepted, then creates the member in a second step;
    // in between, the seat the invitation held looks free. A promotion right then must not
    // leave the agency with more staff than its plan allows.
    const a = await agency();
    const invitee = await account();
    const invitation = await invite(a, invitee.email);
    const x = await member(a.id, "artist");
    const held = intercept(prisma.invitation, "update", (arg: { data: { status?: string } }) => arg.data.status === "accepted", "after");
    try {
      const accepting = auth.api.acceptInvitation({ headers: invitee.headers, body: { invitationId: invitation.id } }).then(
        () => "ok",
        (e: unknown) => e,
      );
      await held.reached;
      await setRole(a, x.id, "agency_staff");
      held.go();
      // The promotion took the seat while it looked free: the join is undone and says so.
      expect(await accepting).toMatchObject(seatsFull);
    } finally {
      held.restore();
    }
    expect(await prisma.member.findFirst({ where: { organizationId: a.id, userId: invitee.userId } })).toBeNull();
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } })).status).toBe("canceled");
    expect(await seatsUsed(a.id)).toBe(2);
  });

  it("stays within the limit when promotions, demotions and invitations overlap", async () => {
    for (let round = 0; round < 3; round++) {
      const a = await agency();
      const staff = await member(a.id, "agency_staff");
      const artists = await Promise.all([1, 2, 3].map(() => member(a.id, "artist")));
      await Promise.allSettled([
        setRole(a, staff.id, "artist"),
        ...artists.map((m) => setRole(a, m.id, "agency_staff")),
        invite(a, `${run}-inv${n++}@test.local`),
      ]);
      expect(await seatsUsed(a.id)).toBeLessThanOrEqual(2);
    }
  });
});

describe("invitations over the limit", () => {
  it("refuses a new staff invitation, and resending one that already holds a seat still sends it", async () => {
    // Over the limit after a downgrade: 2 staff besides the owner, and a pending invitation.
    const a = await agency();
    await member(a.id, "agency_staff");
    await member(a.id, "agency_staff");
    const email = `${run}-pending${n++}@test.local`;
    const pending = await prisma.invitation.create({
      data: { id: randomUUID(), organizationId: a.id, email, role: "agency_staff", status: "pending", expiresAt: new Date(Date.now() + 86_400_000), inviterId: a.owner.userId },
    });

    await expect(invite(a, `${run}-new${n++}@test.local`)).rejects.toMatchObject(seatsFull);

    // A resend takes no new seat: it's sent, and what the caller is told matches what happened.
    await invite(a, email, true);
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe("pending");
    expect(vi.mocked(deliver).mock.calls.some(([job]) => job.kind === "invitation" && job.to === email)).toBe(true);
  });
});
