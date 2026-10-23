import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AffiliateAdminError, createAffiliateByAdmin, deleteAffiliateByAdmin, updateAffiliateByAdmin } from "./affiliates";
import { AgencyAdminError, createAgencyForOwner, deleteAgency, extendTrial, grantPlan, listAgencies, setAgencySuspended } from "./agencies";
import { prisma } from "./client";
import { seedPlans } from "./seed-plans";
import { createPlatformAdmin, deleteUserByAdmin, listUsers, signOutEverywhere, updateUserByAdmin, UserAdminError } from "./users";

const run = `adm${Date.now().toString(36)}`;
const email = (who: string) => `${run}-${who}@test.local`;
const admin = `${run}-admin`;
const orgs: string[] = [];

beforeAll(async () => {
  await seedPlans(prisma);
  await prisma.user.create({ data: { id: admin, name: "Admin", email: email("admin"), platformRole: "platform_admin" } });
});

afterAll(async () => {
  await prisma.affiliate.deleteMany({ where: { user: { email: { startsWith: run } } } });
  await prisma.booking.deleteMany({ where: { organizationId: { in: orgs } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: run } } });
});

describe("agency admin", () => {
  it("creates an agency with its owner and a trial, and finds it by owner email", async () => {
    const r = await createAgencyForOwner({ name: `${run} Feestbureau`, city: "Utrecht", ownerName: "Olga Owner", ownerEmail: email("owner"), locale: "nl" });
    orgs.push(r.organization.id);
    expect(r.newUser).toBe(true);
    const sub = await prisma.subscription.findUnique({ where: { organizationId: r.organization.id } });
    expect(sub?.status).toBe("trialing");
    const found = await listAgencies({ q: email("owner") });
    expect(found.rows.map((a) => a.id)).toContain(r.organization.id);
  });

  it("won't make a platform admin an agency owner", async () => {
    await expect(createAgencyForOwner({ name: `${run} Nope`, city: null, ownerName: "Admin", ownerEmail: email("admin"), locale: "nl" })).rejects.toBeInstanceOf(AgencyAdminError);
  });

  it("suspends, extends a trial and grants a plan", async () => {
    const id = orgs[0]!;
    await setAgencySuspended(id, true, "Unpaid invoices");
    expect((await listAgencies({ q: run, status: "suspended" })).rows.map((a) => a.id)).toContain(id);
    await setAgencySuspended(id, false, null);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id } })).suspendedAt).toBeNull();

    const before = (await prisma.subscription.findUniqueOrThrow({ where: { organizationId: id } })).trialEndsAt!;
    const after = (await extendTrial(id, 10)).trialEndsAt!;
    expect(after.getTime() - before.getTime()).toBe(10 * 86_400_000);

    const granted = await grantPlan(id, (await prisma.plan.findFirstOrThrow()).key);
    expect(granted).toMatchObject({ status: "active", complimentary: true });
    await expect(grantPlan(id, "no-such-plan")).rejects.toMatchObject({ code: "plan_not_found" });
  });

  it("deletes an agency without bookings, but not one with bookings", async () => {
    const empty = await createAgencyForOwner({ name: `${run} Leeg`, city: null, ownerName: "Olga Owner", ownerEmail: email("owner"), locale: "nl" });
    expect(empty.newUser).toBe(false);
    await deleteAgency(empty.organization.id);
    expect(await prisma.organization.findUnique({ where: { id: empty.organization.id } })).toBeNull();

    const busy = orgs[0]!;
    await prisma.booking.create({
      data: { id: randomUUID(), organizationId: busy, trackingCode: randomUUID().slice(0, 8).toUpperCase(), eventType: "wedding", eventDate: new Date("2027-06-14") },
    });
    await expect(deleteAgency(busy)).rejects.toMatchObject({ code: "has_bookings" });
  });
});

describe("user admin", () => {
  it("adds a platform admin, or promotes an existing account", async () => {
    const created = await createPlatformAdmin({ name: "New Admin", email: email("new-admin") });
    expect(created.platformRole).toBe("platform_admin");
    await expect(createPlatformAdmin({ name: "Again", email: email("new-admin") })).rejects.toMatchObject({ code: "email_taken" });
    const promoted = await createPlatformAdmin({ name: "ignored", email: email("owner") });
    expect(promoted).toMatchObject({ name: "Olga Owner", platformRole: "platform_admin" });
    await prisma.user.update({ where: { id: promoted.id }, data: { platformRole: null } });
  });

  it("edits details, asks to confirm a new email and refuses a taken one", async () => {
    const u = await prisma.user.create({ data: { id: randomUUID(), name: "Edit Me", email: email("edit"), emailVerified: true } });
    const updated = await updateUserByAdmin(u.id, { name: "Edited", email: email("edited"), phone: " 0612345678 " });
    expect(updated).toMatchObject({ name: "Edited", emailVerified: false, phone: "0612345678" });
    await expect(updateUserByAdmin(u.id, { name: "Edited", email: email("admin") })).rejects.toBeInstanceOf(UserAdminError);
  });

  it("filters by role and signs out every session", async () => {
    expect((await listUsers({ q: run, filter: "platform_admin" })).rows.every((u) => u.platformRole === "platform_admin")).toBe(true);
    const u = await prisma.user.findUniqueOrThrow({ where: { email: email("edited") } });
    await prisma.session.createMany({
      data: [1, 2].map((n) => ({ id: randomUUID(), userId: u.id, token: `${run}-${n}`, expiresAt: new Date(Date.now() + 86_400_000) })),
    });
    expect(await signOutEverywhere(u.id)).toBe(2);
  });

  it("deletes only accounts without history, and never yourself", async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { email: email("edited") } });
    await deleteUserByAdmin(u.id, admin);
    expect(await prisma.user.findUnique({ where: { id: u.id } })).toBeNull();
    const owner = await prisma.user.findUniqueOrThrow({ where: { email: email("owner") } });
    await expect(deleteUserByAdmin(owner.id, admin)).rejects.toMatchObject({ code: "has_history" });
    await expect(deleteUserByAdmin(admin, admin)).rejects.toMatchObject({ code: "is_self" });
  });
});

describe("partner admin", () => {
  it("adds, edits and deletes a partner without history", async () => {
    const { affiliate: a } = await createAffiliateByAdmin({ name: "Pim Partner", email: email("partner"), code: `${run}pim`, website: null, commissionBps: 2500, locale: "nl" });
    expect(a.status).toBe("approved");
    await expect(createAffiliateByAdmin({ name: "Pim", email: email("partner"), code: null, website: null, commissionBps: null, locale: "nl" })).rejects.toMatchObject({ code: "already_partner" });
    await expect(createAffiliateByAdmin({ name: "Admin", email: email("admin"), code: null, website: null, commissionBps: null, locale: "nl" })).rejects.toBeInstanceOf(AffiliateAdminError);

    const edited = await updateAffiliateByAdmin(a.id, { code: `${run}pim2`, promoCode: `${run}PIM`.toUpperCase(), website: "https://pim.example", pitch: null, commissionBps: null });
    expect(edited).toMatchObject({ code: `${run}pim2`, commissionBps: null, stripePromotionCodeId: null });

    await deleteAffiliateByAdmin(a.id);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: email("partner") } });
    expect(user.platformRole).toBeNull();
    expect(await prisma.affiliate.findUnique({ where: { id: a.id } })).toBeNull();
  });
});
