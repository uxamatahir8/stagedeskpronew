import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Queue as QueueType, Worker as WorkerType } from "bullmq";
import { createTranslator } from "next-intl";
import en from "../../messages/en.json";
import nl from "../../messages/nl.json";

/**
 * Artist setup emails and change decision emails through the real outbox and
 * into Mailpit. Redis database 7 keeps the jobs away from a dev worker.
 */
process.env["REDIS_URL"] = "redis://localhost:6379/7";
process.env["SMTP_HOST"] = "localhost";
process.env["SMTP_PORT"] = "1025";
process.env["SMTP_USER"] = "";
process.env["MAIL_FROM"] = "StageDesk <no-reply@stagedesk.local>";
vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  // No request here: every translation in these modules names its language.
  getTranslations: async (opts: { locale: "nl" | "en"; namespace?: string }) => createTranslator({ locale: opts.locale, messages: (opts.locale === "en" ? en : nl) as never, namespace: opts.namespace as never }),
}));

const MAILPIT = "http://localhost:8025/api/v1";
const run = `pm${Date.now().toString(36)}`;
const org = `${run}-org`;
const owner = `${run}-owner`;
const customerEn = `${run}-en`;
const customerNl = `${run}-nl`;
const address = (id: string) => `${id}@test.local`;
const future = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const line = { description: "DJ", quantityHundredths: 100, unitPriceCents: 100_000, vatBps: 2100 };

type Db = typeof import("@stagedesk/db");
type Accounts = typeof import("./artist-account");
type Changes = typeof import("./change-requests");
let db: Db;
let accounts: Accounts;
let changes: Changes;
let worker: WorkerType;
let queue: QueueType;

/** The database and the queue both refuse: the one case nothing durable has the message. */
async function outboxAndQueueDown() {
  const { Queue } = await import("bullmq");
  const create = vi.spyOn(db.prisma.emailMessage, "create").mockRejectedValue(new Error("Database down"));
  const workers = vi.spyOn(Queue.prototype, "getWorkersCount").mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:6379"));
  return () => {
    create.mockRestore();
    workers.mockRestore();
  };
}

async function inbox(to: string) {
  const res = await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:${to}`)}`);
  return ((await res.json()).messages ?? []) as { ID: string; Subject: string }[];
}
async function text(id: string) {
  return (await (await fetch(`${MAILPIT}/message/${id}`)).json()) as { Text: string; HTML: string; Subject: string };
}
async function until(check: () => Promise<boolean>, ms = 20_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("timed out");
}

async function request(customer: string, over: Record<string, string | number | null>, date = future(100)) {
  const booking = await db.createBooking(org, { customerId: customer, eventType: "wedding", eventDate: date, venueName: "Tivoli", venueCity: "Utrecht", guestCount: 100 }, owner);
  const quote = await db.sendQuote(org, booking.id, { lines: [line], depositBps: 0, expiresInDays: 14 }, owner);
  await db.acceptQuote(org, quote.id, { actor: "customer", actorId: customer, name: "Klant" });
  const { requestId } = await db.submitEventChange(org, booking.id, customer, { eventType: "wedding", eventDate: date, startTime: null, endTime: null, venueName: "Tivoli", venueAddress: null, venueCity: "Utrecht", guestCount: 100, ...over }, null);
  return { booking, requestId: requestId! };
}

beforeAll(async () => {
  db = await import("@stagedesk/db");
  accounts = await import("./artist-account");
  changes = await import("./change-requests");
  const { Queue, Worker } = await import("bullmq");
  const { Redis } = await import("ioredis");
  const { redis } = await import("./redis");
  const { EMAIL_QUEUE } = await import("@stagedesk/emails");
  const { sendStored } = await import("./deliver");
  queue = new Queue(EMAIL_QUEUE, { connection: redis });
  await queue.obliterate({ force: true }).catch(() => undefined);
  // BullMQ counts workers across the whole Redis server, so a dev worker on another
  // database looks like one here and would leave the jobs waiting. Bring our own.
  worker = new Worker(EMAIL_QUEUE, async (j) => sendStored((j.data as { outboxId: string }).outboxId), { connection: new Redis("redis://localhost:6379/7", { maxRetriesPerRequest: null }) });
  await worker.waitUntilReady();
  await db.prisma.organization.create({ data: { id: org, name: "Mail Agency", slug: org, contactEmail: `${run}-agency@test.local`, phone: "+31 30 1234567" } });
  await db.prisma.user.createMany({
    data: [
      { id: owner, name: "Owner", email: address(owner), emailVerified: true },
      { id: customerEn, name: "Erin English", email: address(customerEn), emailVerified: true, locale: "en" },
      { id: customerNl, name: "Noor Nederlands", email: address(customerNl), emailVerified: true, locale: "nl" },
    ],
  });
  // Signed in before, so their own language counts rather than the agency's.
  await db.prisma.account.createMany({ data: [customerEn, customerNl].map((id) => ({ id: `${id}-a`, accountId: id, providerId: "credential", userId: id, password: "x" })) });
  await db.prisma.member.createMany({
    data: [
      { id: `${run}-m1`, organizationId: org, userId: owner, role: "agency_owner" },
      { id: `${run}-m2`, organizationId: org, userId: customerEn, role: "customer" },
      { id: `${run}-m3`, organizationId: org, userId: customerNl, role: "customer" },
    ],
  });
}, 60_000);

afterAll(async () => {
  await worker.close();
  await queue.obliterate({ force: true }).catch(() => undefined);
  await queue.close();
  await db.prisma.emailMessage.deleteMany({ where: { to: { contains: run } } });
  const bookings = (await db.prisma.booking.findMany({ where: { organizationId: org }, select: { id: true } })).map((b) => b.id);
  await db.prisma.bookingChangeRequest.deleteMany({ where: { bookingId: { in: bookings } } });
  await db.prisma.bookingEvent.deleteMany({ where: { bookingId: { in: bookings } } });
  await db.prisma.quoteItem.deleteMany({ where: { organizationId: org } });
  await db.prisma.quote.deleteMany({ where: { organizationId: org } });
  await db.prisma.booking.deleteMany({ where: { organizationId: org } });
  await db.prisma.artist.deleteMany({ where: { organizationId: org } });
  await db.prisma.member.deleteMany({ where: { organizationId: org } });
  await db.prisma.auditEvent.deleteMany({ where: { agencyId: org } });
  await db.prisma.organization.deleteMany({ where: { id: org } });
  await db.prisma.notification.deleteMany({ where: { userId: { startsWith: run } } });
  await db.prisma.verification.deleteMany({ where: { value: { startsWith: run } } });
  await db.prisma.account.deleteMany({ where: { userId: { startsWith: run } } });
  await db.prisma.user.deleteMany({ where: { email: { contains: run } } });
  await db.prisma.$disconnect();
  (await import("./redis")).redis.disconnect();
});

describe("artist setup email", () => {
  const input = (email: string) => ({ organizationId: org, email, name: "DJ Nieuw", locale: "nl" });

  it("creates the account, stores the email once and reports it as accepted, not delivered", async () => {
    const email = `${run}-new@test.local`;
    const account = await accounts.ensureArtistAccount(input(email));
    expect(account).toMatchObject({ created: true, needsSetup: true, email });
    expect(await accounts.sendArtistSetup(org, account)).toBe("accepted");
    expect(await db.prisma.emailMessage.count({ where: { to: email, kind: "artistAccountSetup" } })).toBe(1);
    await until(async () => (await inbox(email)).length === 1);
    const mail = await text((await inbox(email))[0]!.ID);
    expect(mail.Text).toMatch(/reset-password\?token=\w+&setup=1/);
    // Asked again, it's the same email: no second one, no extra live token.
    const tokens = await db.prisma.verification.count({ where: { value: account.userId } });
    expect(await accounts.sendArtistSetup(org, account)).toBe("already_sent");
    expect(await db.prisma.verification.count({ where: { value: account.userId } })).toBe(tokens);
  });

  it("says so when the email can't be stored, and leaves everything recoverable", async () => {
    const email = `${run}-unstored@test.local`;
    const account = await accounts.ensureArtistAccount(input(email));
    const restore = await outboxAndQueueDown();
    const result = await accounts.sendArtistSetup(org, account);
    restore();
    expect(result).toBe("failed");
    // The account is there and still needs setup; the resend path works once the database is back.
    expect(await db.prisma.member.count({ where: { organizationId: org, userId: account.userId, role: "artist" } })).toBe(1);
    expect(await accounts.resendArtistSetup(org, { id: account.userId, email, name: account.name, locale: "nl" })).toBe("accepted");
  });

  it("keeps the message in the outbox when Redis is down", async () => {
    const { Queue } = await import("bullmq");
    const spy = vi.spyOn(Queue.prototype, "getWorkersCount").mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:6379"));
    const email = `${run}-redis@test.local`;
    const account = await accounts.ensureArtistAccount(input(email));
    expect(await accounts.sendArtistSetup(org, account)).toBe("accepted");
    spy.mockRestore();
    await until(async () => (await db.prisma.emailMessage.findFirstOrThrow({ where: { to: email } })).status === "sent");
  });

  it("recovers from an SMTP failure through the outbox", async () => {
    const email = `${run}-smtp@test.local`;
    const account = await accounts.ensureArtistAccount(input(email));
    const emails = await import("@stagedesk/emails");
    const stored = await db.recordEmail({ key: `${run}:smtp`, kind: "artistAccountSetup", to: email, job: { kind: "artistAccountSetup", to: email, params: { locale: "nl", name: account.name, url: "http://localhost/x" } } });
    expect(await db.processEmail(stored.id, async () => Promise.reject(new Error("connect ECONNREFUSED 127.0.0.1:25")))).toBe("failed");
    expect((await db.prisma.emailMessage.findUniqueOrThrow({ where: { id: stored.id } })).status).toBe("failed");
    expect(await db.retryEmail(stored.id)).toBe(true);
    expect(await db.processEmail(stored.id, (job, messageId) => emails.sendEmailJob(job as never, { messageId }))).toBe("sent");
  });

  it("resending replaces the earlier link, so only one works", async () => {
    const email = `${run}-resend@test.local`;
    const account = await accounts.ensureArtistAccount(input(email));
    await accounts.sendArtistSetup(org, account);
    const first = await db.prisma.verification.findFirstOrThrow({ where: { value: account.userId } });
    expect(await accounts.resendArtistSetup(org, { id: account.userId, email, name: account.name, locale: "nl" })).toBe("accepted");
    const left = await db.prisma.verification.findMany({ where: { value: account.userId } });
    expect(left).toHaveLength(1);
    expect(left[0]!.identifier).not.toBe(first.identifier);
    expect(await db.prisma.user.count({ where: { email } })).toBe(1);
  });

  it("links an existing account without asking for a password it already has", async () => {
    const email = `${run}-existing@test.local`;
    const id = `${run}-existing`;
    await db.prisma.user.create({ data: { id, name: "Bestaand", email, emailVerified: true } });
    await db.prisma.account.create({ data: { id: `${id}-a`, accountId: id, providerId: "credential", userId: id, password: "x" } });
    expect(await accounts.ensureArtistAccount(input(email))).toMatchObject({ userId: id, created: false, needsSetup: false, name: "Bestaand" });
  });

  it("does send a link to an existing account without a password", async () => {
    const email = `${run}-nopass@test.local`;
    await db.prisma.user.create({ data: { id: `${run}-nopass`, name: "Zonder", email, emailVerified: true } });
    expect(await accounts.ensureArtistAccount(input(email))).toMatchObject({ created: false, needsSetup: true });
  });

  it("refuses a disabled account, a platform admin, someone with another role, and a double link", async () => {
    await db.prisma.user.create({ data: { id: `${run}-off`, name: "Uit", email: `${run}-off@test.local`, disabledAt: new Date() } });
    await expect(accounts.ensureArtistAccount(input(`${run}-off@test.local`))).rejects.toMatchObject({ code: "disabled" });
    await db.prisma.user.create({ data: { id: `${run}-admin`, name: "Admin", email: `${run}-admin@test.local`, platformRole: "platform_admin" } });
    await expect(accounts.ensureArtistAccount(input(`${run}-admin@test.local`))).rejects.toMatchObject({ code: "not_allowed" });
    await expect(accounts.ensureArtistAccount(input(address(owner)))).rejects.toMatchObject({ code: "other_role" });
    const linked = await accounts.ensureArtistAccount(input(`${run}-linked@test.local`));
    await db.prisma.artist.create({ data: { id: `${run}-linked-a`, organizationId: org, userId: linked.userId, stageName: "DJ Gekoppeld", genres: [] } });
    await expect(accounts.ensureArtistAccount(input(`${run}-linked@test.local`))).rejects.toMatchObject({ code: "already_linked" });
  });

  it("makes one account from two simultaneous invitations", async () => {
    const email = `${run}-twice@test.local`;
    const results = await Promise.allSettled([accounts.ensureArtistAccount(input(email)), accounts.ensureArtistAccount(input(email))]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    expect(await db.prisma.user.count({ where: { email } })).toBe(1);
    const user = await db.prisma.user.findUniqueOrThrow({ where: { email } });
    expect(await db.prisma.member.count({ where: { organizationId: org, userId: user.id } })).toBe(1);
  });
});

describe("change decision email", () => {
  it("tells the customer about an approval once, in English, with the booking as it is now", async () => {
    const { booking, requestId } = await request(customerEn, { eventDate: future(110), venueCity: "Zeist" }, future(101));
    const decision = await db.decideChangeRequest(org, requestId, owner, { approve: true, note: "See you there" });
    expect(await changes.emailChangeDecision(decision)).toBe(true);
    // A retry stores nothing new.
    expect(await changes.emailChangeDecision(decision)).toBe(true);
    const key = `change-decision:${requestId}:approved`;
    expect(await db.prisma.emailMessage.count({ where: { key } })).toBe(1);
    expect((await db.prisma.emailMessage.findFirstOrThrow({ where: { key } })).bookingId).toBe(booking.id);

    await until(async () => (await inbox(address(customerEn))).some((m) => m.Subject.includes(booking.trackingCode)));
    await new Promise((r) => setTimeout(r, 500));
    const mails = (await inbox(address(customerEn))).filter((m) => m.Subject.includes(booking.trackingCode));
    expect(mails).toHaveLength(1);
    const mail = await text(mails[0]!.ID);
    expect(mail.Subject).toContain("has made your change");
    expect(mail.Text).toContain("Erin");
    expect(mail.Text).toContain("Mail Agency");
    expect(mail.Text).toContain("Zeist");
    expect(mail.Text).toContain("See you there");
    expect(mail.Text).toContain(`/app/event?booking=${booking.trackingCode}`);
    expect(mail.Text).toContain("+31 30 1234567");
    expect(mail.HTML).toContain(booking.trackingCode);
  });

  it("tells the customer about a refusal in Dutch, and their booking stays", async () => {
    const date = future(102);
    const { booking, requestId } = await request(customerNl, { eventDate: future(111) }, date);
    const decision = await db.decideChangeRequest(org, requestId, owner, { approve: false, note: "We zitten vol" });
    expect(await changes.emailChangeDecision(decision)).toBe(true);
    await until(async () => (await inbox(address(customerNl))).some((m) => m.Subject.includes(booking.trackingCode)));
    const mail = await text((await inbox(address(customerNl))).find((m) => m.Subject.includes(booking.trackingCode))!.ID);
    expect(mail.Subject).toContain("kon je wijziging niet doorvoeren");
    expect(mail.Text).toContain("Noor");
    expect(mail.Text).toContain("We zitten vol");
    expect(mail.Text).toContain("Je vroeg om");
    expect((await db.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).eventDate?.toISOString().slice(0, 10)).toBe(date);
    // Still an in-app notification too.
    expect(await db.prisma.notification.count({ where: { userId: customerNl, type: "change_rejected", url: `/app/event?booking=${booking.trackingCode}` } })).toBe(1);
  });

  it("sends nothing for a refused or duplicate decision: only one of two wins", async () => {
    const { requestId } = await request(customerEn, { eventDate: future(112) }, future(103));
    const results = await Promise.allSettled([db.decideChangeRequest(org, requestId, owner, { approve: true }), db.decideChangeRequest(org, requestId, owner, { approve: false })]);
    const won = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<Db["decideChangeRequest"]>>>[];
    expect(won).toHaveLength(1);
    await changes.emailChangeDecision(won[0]!.value);
    const stored = await db.prisma.emailMessage.findMany({ where: { key: { startsWith: `change-decision:${requestId}` } } });
    expect(stored).toHaveLength(1);
  });

  it("keeps the decision when the email can't be stored, and reports that", async () => {
    const { requestId, booking } = await request(customerEn, { eventDate: future(113) }, future(104));
    const decision = await db.decideChangeRequest(org, requestId, owner, { approve: true });
    const restore = await outboxAndQueueDown();
    const mailed = await changes.emailChangeDecision(decision);
    restore();
    expect(mailed).toBe(false);
    expect((await db.prisma.bookingChangeRequest.findUniqueOrThrow({ where: { id: requestId } })).status).toBe("approved");
    expect((await db.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).eventDate?.toISOString().slice(0, 10)).toBe(future(113));
    // Trying again once the database is back stores it.
    expect(await changes.emailChangeDecision(decision)).toBe(true);
  });

  it("is sent with the agency as sender, and never for an unauthorised outcome", async () => {
    const { requestId } = await request(customerEn, { eventDate: future(114) }, future(105));
    await expect(db.decideChangeRequest(`${run}-nope`, requestId, owner, { approve: true })).rejects.toBeDefined();
    expect(await db.prisma.emailMessage.count({ where: { key: { startsWith: `change-decision:${requestId}` } } })).toBe(0);
  });
});
