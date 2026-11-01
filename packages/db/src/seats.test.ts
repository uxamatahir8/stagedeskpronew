import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { grantPlan } from "./agencies";
import { agencyBilling, agencyUsage, changeMemberRoleWithinSeats, confirmInvitationSeat, SeatLimitError } from "./billing";
import { prisma } from "./client";
import { seedPlans } from "./seed-plans";

/**
 * Staff seats (`maxStaff`) on role changes and invitations. The Starter plan
 * has 2 seats; the owner takes one.
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

beforeAll(async () => {
  await seedPlans(prisma);
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
  await prisma.user.deleteMany({ where: { id: { startsWith: run } } });
});

describe("staff seats on role changes", () => {
  it("lets an artist become staff while a seat is free, and refuses the next one at the limit", async () => {
    const { id } = await agency();
    expect((await agencyBilling(id)).limits.maxStaff).toBe(2);
    const first = await member(id, "artist");
    const second = await member(id, "artist");

    await changeMemberRoleWithinSeats(id, first.id, "agency_staff");
    expect(await roleOf(first.id)).toBe("agency_staff");
    expect((await agencyUsage(id)).maxStaff).toBe(2);

    await expect(changeMemberRoleWithinSeats(id, second.id, "agency_admin")).rejects.toBeInstanceOf(SeatLimitError);
    await expect(changeMemberRoleWithinSeats(id, second.id, "agency_owner")).rejects.toBeInstanceOf(SeatLimitError);
    expect(await roleOf(second.id)).toBe("artist");
  });

  it("moves staff between staff roles at the limit, and a demoted artist frees the seat", async () => {
    const { id } = await agency();
    const staff = await member(id, "agency_staff");
    const artist = await member(id, "artist");

    // Already holds a seat: no second one needed.
    await changeMemberRoleWithinSeats(id, staff.id, "agency_admin");
    await changeMemberRoleWithinSeats(id, staff.id, "agency_staff");
    expect(await roleOf(staff.id)).toBe("agency_staff");

    await expect(changeMemberRoleWithinSeats(id, artist.id, "agency_staff")).rejects.toBeInstanceOf(SeatLimitError);
    await changeMemberRoleWithinSeats(id, staff.id, "artist");
    expect((await agencyUsage(id)).maxStaff).toBe(1);
    await changeMemberRoleWithinSeats(id, artist.id, "agency_staff");
    expect(await roleOf(artist.id)).toBe("agency_staff");
  });

  it("counts pending staff invitations, not artist or expired ones", async () => {
    const { id, owner } = await agency();
    const artist = await member(id, "artist");
    await invite(id, owner.userId, "artist");
    const expired = await invite(id, owner.userId);
    await prisma.invitation.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const pending = await invite(id, owner.userId);

    await expect(changeMemberRoleWithinSeats(id, artist.id, "agency_staff")).rejects.toBeInstanceOf(SeatLimitError);
    await prisma.invitation.update({ where: { id: pending.id }, data: { status: "canceled" } });
    await changeMemberRoleWithinSeats(id, artist.id, "agency_staff");
    expect(await roleOf(artist.id)).toBe("agency_staff");
  });

  it("has no limit on a plan without one, and leaves other agencies' members alone", async () => {
    const { id } = await agency("business");
    for (let i = 0; i < 4; i++) await changeMemberRoleWithinSeats(id, (await member(id, "artist")).id, "agency_staff");
    expect((await agencyUsage(id)).maxStaff).toBe(5);

    const other = await agency();
    const outsider = await member(other.id, "artist");
    expect(await changeMemberRoleWithinSeats(id, outsider.id, "agency_staff")).toBeNull();
    expect(await roleOf(outsider.id)).toBe("artist");
  });

  it("gives the last seat to only one of several simultaneous promotions", async () => {
    for (let round = 0; round < 3; round++) {
      const { id } = await agency();
      const artists = await Promise.all([1, 2, 3, 4].map(() => member(id, "artist")));
      const results = await Promise.allSettled(artists.map((a) => changeMemberRoleWithinSeats(id, a.id, "agency_staff")));
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      for (const r of results) if (r.status === "rejected") expect(r.reason).toBeInstanceOf(SeatLimitError);
      expect((await agencyUsage(id)).maxStaff).toBe(2);
    }
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

  it("never lets an invitation and a promotion both take the last seat", async () => {
    for (let round = 0; round < 4; round++) {
      const { id, owner } = await agency();
      const artist = await member(id, "artist");
      const [promoted, invited] = await Promise.allSettled([
        changeMemberRoleWithinSeats(id, artist.id, "agency_staff"),
        (async () => confirmInvitationSeat(id, (await invite(id, owner.userId)).id))(),
      ]);
      const promotedOk = promoted.status === "fulfilled";
      const invitedOk = invited.status === "fulfilled" && invited.value;
      expect(promotedOk !== invitedOk).toBe(true);
      expect((await agencyUsage(id)).maxStaff).toBe(2);
    }
  });
});
