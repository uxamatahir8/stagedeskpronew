import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AffiliateAdminError, createAffiliateByAdmin, deleteAffiliateByAdmin, updateAffiliateByAdmin } from "./affiliates";
import { AgencyAdminError, createAgencyForOwner, deleteAgency, extendTrial, grantPlan, listAgencies, setAgencySuspended } from "./agencies";
import { prisma } from "./client";
import { agencyLeadOffers, assignLead, closeLead, LeadError, offerLead, respondToLeadOffer, submitLead, type LeadInput } from "./leads";
import { clearReadNotifications, listNotifications, markNotificationsRead, notify } from "./notifications";
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
  await prisma.lead.deleteMany({ where: { email: { startsWith: run } } });
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

describe("notifications page", () => {
  it("pages through a user's notifications, filters unread and clears the read ones", async () => {
    const id = randomUUID();
    await prisma.user.create({ data: { id, name: "Noor", email: email("notified") } });
    await notify([id], { type: "message", data: { name: "Sanne", code: "AAAA1111" } });
    await notify([id], { type: "new_inquiry", data: { name: "Bram" } });
    const [first] = (await listNotifications(id)).items;
    await markNotificationsRead(id, [first!.id]);

    const all = await listNotifications(id, { pageSize: 1 });
    expect(all).toMatchObject({ total: 2, unread: 1, pages: 2 });
    expect((await listNotifications(id, { unreadOnly: true })).total).toBe(1);
    expect(await clearReadNotifications(id)).toBe(1);
    expect((await listNotifications(id)).total).toBe(1);
  });
});

describe("platform leads", () => {
  const request = (who: string): LeadInput => ({
    name: "Lotte Lead",
    email: email(who),
    phone: "0612345678",
    locale: "nl",
    eventType: "wedding",
    eventDate: "2027-06-14",
    startTime: "20:00",
    venueName: "Kasteel",
    venueCity: "Utrecht",
    guestCount: 120,
    budgetRange: "1500_2500",
    preferredGenre: "Pop",
    partnerName: "Sam",
    ceremony: true,
    message: "Graag tot 1 uur",
  });
  const agency = async (name: string) => {
    const r = await createAgencyForOwner({ name: `${run} ${name}`, city: "Utrecht", ownerName: "Owner", ownerEmail: email(`owner-${name}`), locale: "nl" });
    orgs.push(r.organization.id);
    return r;
  };

  it("offers a lead to two agencies; the first to accept gets it as a booking, the other loses the offer", async () => {
    const [a, b] = [await agency("LeadA"), await agency("LeadB")];
    const lead = await submitLead(request("lead1"));
    expect(lead.reference).toMatch(/^L-[A-Z2-9]{6}$/);
    expect(await offerLead(lead.id, [a.organization.id, b.organization.id])).toHaveLength(2);
    // Offering again is a no-op.
    expect(await offerLead(lead.id, [a.organization.id])).toEqual([]);

    // Agencies see the request but not who sent it.
    const [seen] = await agencyLeadOffers(b.organization.id);
    expect(seen).toMatchObject({ reference: lead.reference, venueCity: "Utrecht", offeredTo: 2 });
    expect(seen).not.toHaveProperty("email");
    expect(seen).not.toHaveProperty("name");

    const result = await respondToLeadOffer(lead.id, a.organization.id, true, a.ownerId);
    expect(result.accepted).toBe(true);
    const booking = await prisma.booking.findFirstOrThrow({ where: { organizationId: a.organization.id, source: "lead" }, include: { customer: true } });
    expect(booking).toMatchObject({ venueCity: "Utrecht", guestCount: 120, ceremony: true });
    expect(booking.customer?.email).toBe(email("lead1"));
    expect(await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).toMatchObject({ status: "assigned", assignedAgencyId: a.organization.id, bookingId: booking.id });

    // B was too late: its offer is withdrawn and accepting fails.
    expect(await agencyLeadOffers(b.organization.id)).toEqual([]);
    await expect(respondToLeadOffer(lead.id, b.organization.id, true, b.ownerId)).rejects.toMatchObject({ code: "not_offered" });
    await expect(assignLead(lead.id, b.organization.id, admin)).rejects.toMatchObject({ code: "taken" });
  });

  it("records a decline, lets the admin assign directly, and closes a lead", async () => {
    const a = await agency("LeadC");
    const declined = await submitLead(request("lead2"));
    await offerLead(declined.id, [a.organization.id]);
    expect(await respondToLeadOffer(declined.id, a.organization.id, false, a.ownerId)).toEqual({ accepted: false });
    expect((await prisma.leadOffer.findFirstOrThrow({ where: { leadId: declined.id } })).status).toBe("declined");
    const { booking } = await assignLead(declined.id, a.organization.id, admin);
    expect(booking.source).toBe("lead");

    const spam = await submitLead(request("lead3"));
    await closeLead(spam.id, "spam");
    expect(await prisma.lead.findUniqueOrThrow({ where: { id: spam.id } })).toMatchObject({ status: "closed", closedReason: "spam" });
    await expect(offerLead(spam.id, [a.organization.id])).rejects.toBeInstanceOf(LeadError);
  });
});
