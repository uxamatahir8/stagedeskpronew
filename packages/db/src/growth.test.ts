import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AGENCY_INVITES_PER_DAY } from "@stagedesk/core";
import { createAgencyForOwner } from "./agencies";
import { prisma } from "./client";
import { agencyActivation } from "./dashboards";
import { AgencyInviteError, createAgencyInvite, invitesSent, markInvitesJoined, recordCancellationFeedback } from "./growth";

const run = `grw${Date.now().toString(36)}`;
const email = (who: string) => `${run}-${who}@test.local`;
const orgs: string[] = [];
let inviter: string;
let inviterAgency: string;

beforeAll(async () => {
  const r = await createAgencyForOwner({ name: `${run} Inviting`, city: "Utrecht", ownerName: "Ivy Inviter", ownerEmail: email("inviter"), locale: "nl" });
  orgs.push(r.organization.id);
  inviter = r.ownerId;
  inviterAgency = r.organization.id;
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: run } } });
});

describe("agency invites", () => {
  it("refuses your own address and someone who already runs an agency", async () => {
    await expect(createAgencyInvite({ email: email("inviter").toUpperCase(), kind: "agency", inviterUserId: inviter, inviterAgencyId: inviterAgency })).rejects.toSatisfy(
      (e) => e instanceof AgencyInviteError && e.code === "self",
    );
    const other = await createAgencyForOwner({ name: `${run} Other`, city: null, ownerName: "Otto", ownerEmail: email("other"), locale: "nl" });
    orgs.push(other.organization.id);
    await expect(createAgencyInvite({ email: email("other"), kind: "agency", inviterUserId: inviter, inviterAgencyId: inviterAgency })).rejects.toSatisfy(
      (e) => e instanceof AgencyInviteError && e.code === "already_on",
    );
  });

  it("doesn't invite the same address twice in a row, and caps invites per day", async () => {
    const now = new Date();
    await createAgencyInvite({ email: ` ${email("partner")} `, kind: "agency", inviterUserId: inviter, inviterAgencyId: inviterAgency }, now);
    await expect(createAgencyInvite({ email: email("partner"), kind: "agency", inviterUserId: inviter, inviterAgencyId: inviterAgency }, now)).rejects.toSatisfy(
      (e) => e instanceof AgencyInviteError && e.code === "already_invited",
    );
    for (let i = 1; i < AGENCY_INVITES_PER_DAY; i++) await createAgencyInvite({ email: email(`bulk${i}`), kind: "agency", inviterUserId: inviter, inviterAgencyId: inviterAgency }, now);
    await expect(createAgencyInvite({ email: email("one-too-many"), kind: "agency", inviterUserId: inviter, inviterAgencyId: inviterAgency }, now)).rejects.toSatisfy(
      (e) => e instanceof AgencyInviteError && e.code === "limit",
    );
  });

  it("marks the invite joined when the invited person starts an agency, and counts it", async () => {
    const before = await agencyActivation(new Date(Date.now() - 60_000));
    const joined = await createAgencyForOwner({ name: `${run} Partner`, city: null, ownerName: "Pam", ownerEmail: email("partner"), locale: "en" });
    orgs.push(joined.organization.id);
    const sent = await invitesSent({ inviterAgencyId: inviterAgency });
    expect(sent.find((i) => i.email === email("partner"))).toMatchObject({ joinedAgency: { name: `${run} Partner` } });
    expect(await markInvitesJoined(email("partner"), joined.organization.id)).toBe(0); // already marked
    const after = await agencyActivation(new Date(Date.now() - 60_000));
    // Other test files may create agencies at the same time, so only a lower bound.
    expect(after.signed - before.signed).toBeGreaterThanOrEqual(1);
    expect(after.invited - before.invited).toBeGreaterThanOrEqual(1);
  });
});

describe("cancellation feedback", () => {
  it("stores the reason and a trimmed note", async () => {
    const row = await recordCancellationFeedback({ agencyId: inviterAgency, userId: inviter, reason: "too_expensive", note: "  " });
    expect(row).toMatchObject({ reason: "too_expensive", note: null });
    expect(await prisma.cancellationFeedback.count({ where: { agencyId: inviterAgency } })).toBe(1);
  });
});
