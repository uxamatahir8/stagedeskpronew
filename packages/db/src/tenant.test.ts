import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./client";
import { tenantDb, tenantModels, TenantScopeError } from "./tenant";

const run = `t${Date.now().toString(36)}`;
const orgA = `${run}-org-a`;
const orgB = `${run}-org-b`;
const ids = { userA: `${run}-user-a`, userB: `${run}-user-b`, memberA: `${run}-mem-a`, memberB: `${run}-mem-b` };

beforeAll(async () => {
  await prisma.organization.createMany({
    data: [
      { id: orgA, name: "Agency A", slug: `${run}-a` },
      { id: orgB, name: "Agency B", slug: `${run}-b` },
    ],
  });
  await prisma.user.createMany({
    data: [
      { id: ids.userA, name: "A", email: `${run}-a@test.local` },
      { id: ids.userB, name: "B", email: `${run}-b@test.local` },
    ],
  });
  await prisma.member.createMany({
    data: [
      { id: ids.memberA, organizationId: orgA, userId: ids.userA, role: "agency_staff" },
      { id: ids.memberB, organizationId: orgB, userId: ids.userB, role: "agency_staff" },
    ],
  });
});

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.userA, ids.userB] } } });
  await prisma.$disconnect();
});

describe("tenantDb", () => {
  it("only returns the agency's own rows", async () => {
    const rows = await tenantDb(orgA).member.findMany({ where: { id: { in: [ids.memberA, ids.memberB] } } });
    expect(rows.map((r) => r.id)).toEqual([ids.memberA]);
    expect(await tenantDb(orgA).member.findFirst({ where: { id: ids.memberB } })).toBeNull();
    expect(await tenantDb(orgA).member.count({ where: { userId: ids.userB } })).toBe(0);
  });

  it("can't update or delete another agency's rows", async () => {
    const updated = await tenantDb(orgA).member.updateMany({ where: { id: ids.memberB }, data: { role: "agency_owner" } });
    const deleted = await tenantDb(orgA).member.deleteMany({ where: { id: ids.memberB } });
    expect(updated.count).toBe(0);
    expect(deleted.count).toBe(0);
    expect((await prisma.member.findUnique({ where: { id: ids.memberB } }))?.role).toBe("agency_staff");
  });

  it("can't move a row to another agency through an update", async () => {
    await tenantDb(orgA).member.updateMany({ where: { id: ids.memberA }, data: { organizationId: orgB } });
    expect((await prisma.member.findUnique({ where: { id: ids.memberA } }))?.organizationId).toBe(orgA);
  });

  it("puts created rows in its own agency, whatever the input says", async () => {
    const created = await tenantDb(orgA).invitation.create({
      data: {
        id: `${run}-inv`,
        email: "new@test.local",
        role: "artist",
        status: "pending",
        expiresAt: new Date(Date.now() + 86_400_000),
        inviterId: ids.userA,
        organizationId: orgB,
      },
    });
    expect(created.organizationId).toBe(orgA);
  });

  it("refuses lookups by unique key, which can't be scoped", async () => {
    await expect(tenantDb(orgA).member.findUnique({ where: { id: ids.memberB } })).rejects.toThrow(TenantScopeError);
    await expect(
      tenantDb(orgA).member.update({ where: { id: ids.memberB }, data: { role: "agency_owner" } }),
    ).rejects.toThrow(TenantScopeError);
  });

  it("lists every model with an organizationId column as a tenant model", () => {
    const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
    const withOrgColumn = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)]
      .filter(([, , body]) => /^\s+organizationId\s/m.test(body ?? ""))
      .map(([, name]) => name)
      .sort();
    expect([...tenantModels].sort()).toEqual(withOrgColumn);
  });
});
