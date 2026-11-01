import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { grantPlan } from "./agencies";
import { agencyBilling, agencyUsage, confirmInvitationSeat, confirmJoinedSeat, confirmMemberSeat } from "./billing";
import { prisma } from "./client";
import { seedPlans } from "./seed-plans";

/**
 * Staff seats (`maxStaff`) on role changes, invitations and joins. Better
 * Auth writes the change; these checks run after it and undo it when the
 * seats are over. The Starter plan has 2 seats; the owner takes one.
 * apps/web's staff-seats.test.ts covers the same through Better Auth's API.
 */
const run = `seat${Date.now().toString(36)}`;
const orgs: string[] = [];
let users = 0;

async function agency(plan = "starter") {
  const id = `${run}-${orgs.length}`;
  await prisma.organization.create({ data: { id, name: id, slug: id } });
  orgs.push(id);
  await grantPlan(id, plan);
  const owner = await member(id, "agency_owner");
  return { id, owner };
}

async function member(organizationId: string, role: string) {
  const userId = `${run}-u${users++}`;
  await prisma.user.create({ data: { id: userId, name: userId, email: `${userId}@test.local` } });
  return prisma.member.create({ data: { id: randomUUID(), organizationId, userId, role } });
}

async function invite(organizationId: string, inviterId: string, role = "agency_staff") {
  return prisma.invitation.create({
    data: { id: randomUUID(), organizationId, email: `${run}-i${users++}@test.local`, role, status: "pending", expiresAt: new Date(Date.now() + 86_400_000), inviterId },
  });
}

const roleOf = async (id: string) => (await prisma.member.findUniqueOrThrow({ where: { id } })).role;

/** A role change as Better Auth makes it: written first, then checked. True when it's kept. */
async function changeRole(organizationId: string, memberId: string, role: string) {
  const previous = await roleOf(memberId);
  await prisma.member.update({ where: { id: memberId }, data: { role } });
  return confirmMemberSeat(organizationId, memberId, previous);
}

beforeAll(async () => {
  await seedPlans(prisma);
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: run } } });
});

describe("staff seats on role changes", () => {
  it("keeps an artist's promotion while a seat is free, and undoes the next one at the limit", async () => {
    const { id } = await agency();
    expect((await agencyBilling(id)).limits.maxStaff).toBe(2);
    const first = await member(id, "artist");
    const second = await member(id, "artist");

    expect(await changeRole(id, first.id, "agency_staff")).toBe(true);
    expect(await roleOf(first.id)).toBe("agency_staff");
    expect((await agencyUsage(id)).maxStaff).toBe(2);

    expect(await changeRole(id, second.id, "agency_admin")).toBe(false);
    expect(await roleOf(second.id)).toBe("artist");
    expect(await changeRole(id, second.id, "agency_owner")).toBe(false);
    expect(await roleOf(second.id)).toBe("artist");
  });

  it("moves staff between staff roles at the limit, and a demoted artist frees the seat", async () => {
    const { id } = await agency();
    const staff = await member(id, "agency_staff");
    const artist = await member(id, "artist");

    // Already holds a seat: no second one needed.
    expect(await changeRole(id, staff.id, "agency_admin")).toBe(true);
    expect(await changeRole(id, staff.id, "agency_staff")).toBe(true);

    expect(await changeRole(id, artist.id, "agency_staff")).toBe(false);
    expect(await changeRole(id, staff.id, "artist")).toBe(true);
    expect((await agencyUsage(id)).maxStaff).toBe(1);
    expect(await changeRole(id, artist.id, "agency_staff")).toBe(true);
    expect(await roleOf(artist.id)).toBe("agency_staff");
  });

  it("counts pending staff invitations, not artist or expired ones", async () => {
    const { id, owner } = await agency();
    const artist = await member(id, "artist");
    await invite(id, owner.userId, "artist");
    const expired = await invite(id, owner.userId);
    await prisma.invitation.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const pending = await invite(id, owner.userId);

    expect(await changeRole(id, artist.id, "agency_staff")).toBe(false);
    await prisma.invitation.update({ where: { id: pending.id }, data: { status: "canceled" } });
    expect(await changeRole(id, artist.id, "agency_staff")).toBe(true);
  });

  it("has no limit on a plan without one, and leaves other agencies' members alone", async () => {
    const { id } = await agency("business");
    for (let i = 0; i < 4; i++) expect(await changeRole(id, (await member(id, "artist")).id, "agency_staff")).toBe(true);
    expect((await agencyUsage(id)).maxStaff).toBe(5);

    // Full, but the member isn't this agency's: nothing to undo here.
    const full = await agency();
    await member(full.id, "agency_staff");
    const other = await agency();
    const outsider = await member(other.id, "agency_staff");
    expect(await confirmMemberSeat(full.id, outsider.id, "artist")).toBe(true);
    expect(await roleOf(outsider.id)).toBe("agency_staff");
  });

  it("keeps the last seat for only one of several simultaneous promotions", async () => {
    for (let round = 0; round < 3; round++) {
      const { id } = await agency();
      const artists = await Promise.all([1, 2, 3, 4].map(() => member(id, "artist")));
      const kept = await Promise.all(artists.map((a) => changeRole(id, a.id, "agency_staff")));
      expect(kept.filter(Boolean)).toHaveLength(1);
      expect((await agencyUsage(id)).maxStaff).toBe(2);
    }
  });
});

describe("staff seats on joining", () => {
  it("removes a member who joined into a seat someone else took meanwhile, and cancels the invitation", async () => {
    const { id, owner } = await agency();
    const invitation = await invite(id, owner.userId);
    // As Better Auth accepts: the invitation is accepted first, the member created after.
    await prisma.invitation.update({ where: { id: invitation.id }, data: { status: "accepted" } });
    const promoted = await member(id, "agency_staff");
    const joined = await member(id, "agency_staff");
    expect(await confirmJoinedSeat(id, joined.id, invitation.id)).toBe(false);
    expect(await prisma.member.findUnique({ where: { id: joined.id } })).toBeNull();
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } })).status).toBe("canceled");
    expect(await roleOf(promoted.id)).toBe("agency_staff");
    expect((await agencyUsage(id)).maxStaff).toBe(2);
  });

  it("keeps a member who joined into a free seat, and any artist", async () => {
    const { id, owner } = await agency();
    const invitation = await invite(id, owner.userId);
    await prisma.invitation.update({ where: { id: invitation.id }, data: { status: "accepted" } });
    const joined = await member(id, "agency_staff");
    expect(await confirmJoinedSeat(id, joined.id, invitation.id)).toBe(true);
    const artist = await member(id, "artist");
    expect(await confirmJoinedSeat(id, artist.id, invitation.id)).toBe(true);
  });
});

describe("staff seats on invitations", () => {
  it("keeps an invitation that fits and cancels one over the limit", async () => {
    const { id, owner } = await agency();
    const first = await invite(id, owner.userId);
    expect(await confirmInvitationSeat(id, first.id)).toBe(true);
    const second = await invite(id, owner.userId);
    expect(await confirmInvitationSeat(id, second.id)).toBe(false);
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: second.id } })).status).toBe("canceled");
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("pending");
    // Artists don't take a seat.
    expect(await confirmInvitationSeat(id, (await invite(id, owner.userId, "artist")).id)).toBe(true);
  });

  it("keeps one of two simultaneous invitations for the last seat", async () => {
    for (let round = 0; round < 3; round++) {
      const { id, owner } = await agency();
      const kept = await Promise.all([1, 2].map(async () => confirmInvitationSeat(id, (await invite(id, owner.userId)).id)));
      expect(kept.filter(Boolean)).toHaveLength(1);
      expect((await agencyUsage(id)).maxStaff).toBe(2);
    }
  });

  it("never lets an invitation and a promotion both keep the last seat", async () => {
    for (let round = 0; round < 4; round++) {
      const { id, owner } = await agency();
      const artist = await member(id, "artist");
      const [promoted, invited] = await Promise.all([changeRole(id, artist.id, "agency_staff"), (async () => confirmInvitationSeat(id, (await invite(id, owner.userId)).id))()]);
      expect(Number(promoted) + Number(invited)).toBe(1);
      expect((await agencyUsage(id)).maxStaff).toBe(2);
    }
  });
});
