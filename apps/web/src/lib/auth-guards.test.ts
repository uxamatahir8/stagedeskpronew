import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

// No email leaves the tests.
vi.mock("./deliver", () => ({ deliver: vi.fn() }));
// The limiter (lib/rate-limit) is server-only; outside Next that guard throws.
vi.mock("server-only", () => ({}));

import { prisma } from "@stagedesk/db";
import { auth } from "./auth-config";

/**
 * Guards added to Better Auth's endpoints after the security QA (8 Nov 2026):
 * only the desk may read who is in an agency, and sign-in attempts are
 * counted atomically per IP (clientIp, TRUSTED_PROXIES) and per account.
 */
const run = `authg${Date.now().toString(36)}`;
const PASSWORD = "Guards-test-2026-ok";
const orgs: string[] = [];
let n = 0;

async function account() {
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

afterAll(async () => {
  await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: run } } });
  vi.unstubAllEnvs();
});

describe("who may read an agency's members", () => {
  it("lets the desk list members and refuses customers and artists", async () => {
    const id = `${run}-org`;
    await prisma.organization.create({ data: { id, name: id, slug: id } });
    orgs.push(id);
    const people: Record<string, Awaited<ReturnType<typeof account>>> = {};
    for (const role of ["agency_owner", "agency_staff", "customer", "artist"]) {
      people[role] = await account();
      await prisma.member.create({ data: { id: randomUUID(), organizationId: id, userId: people[role].userId, role } });
    }
    const outsider = await account();

    const list = (who: { headers: Headers }) => auth.api.listMembers({ headers: who.headers, query: { organizationId: id } });
    const full = (who: { headers: Headers }) => auth.api.getFullOrganization({ headers: who.headers, query: { organizationId: id } });
    const invites = (who: { headers: Headers }) => auth.api.listInvitations({ headers: who.headers, query: { organizationId: id } });

    expect((await list(people["agency_owner"]!)).members.length).toBe(4);
    expect((await list(people["agency_staff"]!)).members.length).toBe(4);
    for (const who of [people["customer"]!, people["artist"]!, outsider]) {
      await expect(list(who)).rejects.toThrow();
      await expect(full(who)).rejects.toThrow();
      await expect(invites(who)).rejects.toThrow();
    }
  });
});

describe("sign-in limits", () => {
  const wrong = (email: string, ip: string) =>
    auth.api.signInEmail({ body: { email, password: "Not-the-password-1" }, headers: new Headers({ "x-forwarded-for": ip }) }).then(
      () => "ok",
      (e: { status?: string; statusCode?: number }) => (e.statusCode === 429 || e.status === "TOO_MANY_REQUESTS" ? "limited" : "refused"),
    );

  it("stops guessing from one address after 10 a minute", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TRUSTED_PROXIES", "1");
    const ip = `198.51.100.${(Date.now() % 200) + 1}`;
    const results = [];
    for (let i = 0; i < 11; i++) results.push(await wrong(`${run}-nobody${i}@test.local`, ip));
    expect(results.slice(0, 10).every((r) => r === "refused")).toBe(true);
    expect(results[10]).toBe("limited");
  });

  it("stops guessing one account from many addresses after 20", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TRUSTED_PROXIES", "1");
    const email = `${run}-target@test.local`;
    const results = [];
    for (let i = 0; i < 21; i++) results.push(await wrong(email, `203.0.113.${i + 1}`));
    expect(results.slice(0, 20).every((r) => r === "refused")).toBe(true);
    expect(results[20]).toBe("limited");
  });
});
