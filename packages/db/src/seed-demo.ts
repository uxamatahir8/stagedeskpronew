import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { PrismaClient } from "./generated/prisma/client";

/** Shared password for every demo account. Development only. */
export const DEMO_PASSWORD = "StageDesk-demo-2026";

interface DemoUser {
  email: string;
  name: string;
  platformRole?: "platform_admin" | "affiliate";
  phone?: string;
}

interface DemoAgency {
  slug: string;
  name: string;
  city: string;
  kvkNumber: string;
  members: { email: string; role: "agency_owner" | "agency_admin" | "agency_staff" | "artist" | "customer" }[];
}

const users: DemoUser[] = [
  { email: "admin@stagedesk.local", name: "Iris Platform", platformRole: "platform_admin" },
  { email: "partner@stagedesk.local", name: "Pim Partner", platformRole: "affiliate" },
  { email: "eigenaar@feestband.local", name: "Mark de Boer" },
  { email: "beheer@feestband.local", name: "Lisa Bakker" },
  { email: "planning@feestband.local", name: "Tom Smit" },
  { email: "dj.sem@feestband.local", name: "Sem Mulder" },
  { email: "sanne@klant.local", name: "Sanne de Vries", phone: "+31 6 12345678" },
  { email: "eigenaar@rotterdamdj.local", name: "Noor Hendriks" },
  { email: "dj.yara@rotterdamdj.local", name: "Yara Peters" },
  { email: "bram@klant.local", name: "Bram Visser", phone: "+31 6 87654321" },
];

const agencies: DemoAgency[] = [
  {
    slug: "feestband-utrecht",
    name: "Feestband Utrecht",
    city: "Utrecht",
    kvkNumber: "12345678",
    members: [
      { email: "eigenaar@feestband.local", role: "agency_owner" },
      { email: "beheer@feestband.local", role: "agency_admin" },
      { email: "planning@feestband.local", role: "agency_staff" },
      { email: "dj.sem@feestband.local", role: "artist" },
      { email: "sanne@klant.local", role: "customer" },
    ],
  },
  {
    slug: "rotterdam-dj-collectief",
    name: "Rotterdam DJ Collectief",
    city: "Rotterdam",
    kvkNumber: "87654321",
    members: [
      { email: "eigenaar@rotterdamdj.local", role: "agency_owner" },
      { email: "dj.yara@rotterdamdj.local", role: "artist" },
      { email: "bram@klant.local", role: "customer" },
    ],
  },
];

/** Creates demo users and agencies if they don't exist yet. Safe to re-run. */
export async function seedDemo(prisma: PrismaClient) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const ids = new Map<string, string>();

  for (const u of users) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      ids.set(u.email, existing.id);
      continue;
    }
    const id = randomUUID();
    await prisma.user.create({
      data: {
        id,
        email: u.email,
        name: u.name,
        emailVerified: true,
        platformRole: u.platformRole ?? null,
        phone: u.phone ?? null,
        accounts: { create: { id: randomUUID(), accountId: id, providerId: "credential", password: passwordHash } },
      },
    });
    ids.set(u.email, id);
    console.log(`  created  user ${u.email}`);
  }

  for (const a of agencies) {
    const org =
      (await prisma.organization.findUnique({ where: { slug: a.slug } })) ??
      (await prisma.organization.create({
        data: { id: randomUUID(), slug: a.slug, name: a.name, city: a.city, kvkNumber: a.kvkNumber },
      }));
    for (const m of a.members) {
      const userId = ids.get(m.email)!;
      await prisma.member.upsert({
        where: { organizationId_userId: { organizationId: org.id, userId } },
        create: { id: randomUUID(), organizationId: org.id, userId, role: m.role },
        update: {},
      });
    }
    console.log(`  ready    agency ${a.name}`);
  }

  await seedBookingData(prisma, ids);
  await seedBookingPage(prisma);
}

/** Booking page content and one approved review for Feestband. Fills only what's empty. */
async function seedBookingPage(prisma: PrismaClient) {
  const feest = await prisma.organization.findUniqueOrThrow({ where: { slug: "feestband-utrecht" } });
  if (!feest.bookingIntro) {
    await prisma.organization.update({
      where: { id: feest.id },
      data: {
        bookingIntro:
          "Feestband Utrecht verzorgt al ruim tien jaar de muziek op bruiloften, bedrijfsfeesten en verjaardagen in heel Midden-Nederland. Onze dj's lezen de zaal en maken van elk feest een avond om nooit te vergeten.",
        phone: feest.phone ?? "+31 30 123 4567",
        contactEmail: feest.contactEmail ?? "info@feestband.local",
        website: feest.website ?? "https://feestband.local",
        faq: [
          { question: "Hoe ver van tevoren moet ik boeken?", answer: "Voor bruiloften in het hoogseizoen (mei tot september) raden we 6 tot 12 maanden aan. Voor andere feesten is 2 maanden meestal genoeg." },
          { question: "Nemen jullie geluid en licht mee?", answer: "Ja. Een complete geluidsset en basisverlichting zijn altijd inbegrepen. Een uitgebreide lichtshow kun je los bijboeken." },
          { question: "Kunnen we verzoeknummers doorgeven?", answer: "Natuurlijk. Na je boeking kun je in je account een playlist en je wel- en niet-doen-lijst invullen." },
        ],
      },
    });
    console.log("  ready    Feestband booking page");
  }

  const settled = await prisma.booking.findFirst({
    where: { organizationId: feest.id, status: "settled", review: null, customerId: { not: null } },
    include: { assignments: { where: { status: "accepted" }, take: 1 } },
  });
  if (settled) {
    await prisma.review.create({
      data: {
        id: randomUUID(),
        organizationId: feest.id,
        bookingId: settled.id,
        customerId: settled.customerId!,
        artistId: settled.assignments[0]?.artistId ?? null,
        rating: 5,
        comment: "DJ Sem had de hele zaal binnen tien minuten op de dansvloer. Precies de mix die we wilden!",
        status: "approved",
        moderatedAt: new Date(),
      },
    });
    console.log("  created  approved review");
  }
}

async function orgId(prisma: PrismaClient, slug: string) {
  return (await prisma.organization.findUniqueOrThrow({ where: { slug }, select: { id: true } })).id;
}

/** Artists, services and bookings in every stage, created through the real booking operations. */
async function seedBookingData(prisma: PrismaClient, ids: Map<string, string>) {
  const feest = await orgId(prisma, "feestband-utrecht");
  const rot = await orgId(prisma, "rotterdam-dj-collectief");
  if (await prisma.booking.count({ where: { organizationId: { in: [feest, rot] } } })) {
    console.log("  kept     demo bookings");
    return;
  }
  const b = await import("./bookings");
  const owner = ids.get("eigenaar@feestband.local")!;
  const rotOwner = ids.get("eigenaar@rotterdamdj.local")!;

  const artist = (organizationId: string, stageName: string, genres: string[], userEmail?: string, shareBps = 4_000) =>
    prisma.artist.create({
      data: {
        id: randomUUID(),
        organizationId,
        userId: userEmail ? ids.get(userEmail)! : null,
        stageName,
        genres,
        defaultShareBps: shareBps,
        bio: null,
      },
    });
  const sem = await artist(feest, "DJ Sem", ["Top 40", "House", "Nederlandstalig"], "dj.sem@feestband.local");
  await artist(feest, "Lotte Sax & Beats", ["Deep house", "Lounge"], undefined, 4_500);
  await artist(feest, "DJ Ruben", ["80s", "90s", "Disco"]);
  const yara = await artist(rot, "DJ Yara", ["Afro house", "R&B"], "dj.yara@rotterdamdj.local");
  await prisma.artistShare.create({
    data: { id: randomUUID(), organizationId: rot, artistId: yara.id, partnerOrganizationId: feest, status: "accepted", respondedAt: new Date() },
  });

  const services = [
    { name: "DJ, per uur", unit: "hour", unitPriceCents: 12_500, vatBps: 2_100 },
    { name: "Ceremoniegeluid", unit: "flat", unitPriceCents: 25_000, vatBps: 2_100 },
    { name: "Lichtshow", unit: "flat", unitPriceCents: 17_500, vatBps: 2_100 },
    { name: "Saxofonist, per uur", unit: "hour", unitPriceCents: 9_500, vatBps: 2_100 },
    { name: "Reiskosten", unit: "flat", unitPriceCents: 4_500, vatBps: 0 },
  ];
  for (const [i, s] of services.entries()) {
    for (const organizationId of [feest, rot]) {
      await prisma.serviceItem.create({ data: { ...s, id: randomUUID(), organizationId, position: i } });
    }
  }

  // Extra Feestband customers.
  const customer = async (email: string, name: string, organizationId: string) => {
    const user =
      (await prisma.user.findUnique({ where: { email } })) ??
      (await prisma.user.create({ data: { id: randomUUID(), email, name, emailVerified: true } }));
    await prisma.member.upsert({
      where: { organizationId_userId: { organizationId, userId: user.id } },
      create: { id: randomUUID(), organizationId, userId: user.id, role: "customer" },
      update: {},
    });
    return user.id;
  };
  const femke = await customer("femke@klant.local", "Femke Visser", feest);
  const events = await customer("events@bedrijf.local", "Rabo Utrecht Events", feest);
  const lotte = await customer("lotte@klant.local", "Lotte Jansen", feest);
  const sanne = ids.get("sanne@klant.local")!;
  const bram = ids.get("bram@klant.local")!;

  const lines = (hours: number) => [
    { description: "DJ, per uur", quantityHundredths: hours * 100, unitPriceCents: 12_500, vatBps: 2_100 },
    { description: "Lichtshow", quantityHundredths: 100, unitPriceCents: 17_500, vatBps: 2_100 },
    { description: "Reiskosten", quantityHundredths: 100, unitPriceCents: 4_500, vatBps: 0 },
  ];
  const now = new Date();
  const earlier = new Date(now.getTime() - 30 * 86_400_000);

  // New corporate inquiry waiting for a quote.
  await b.createBooking(
    feest,
    {
      customerId: events,
      eventType: "corporate",
      eventDate: "2026-12-18",
      startTime: "20:00",
      endTime: "00:30",
      venueName: "Fort aan de Klop",
      venueCity: "Utrecht",
      guestCount: 180,
      budgetCents: 250_000,
      message: "Kerstborrel voor het team. Graag een DJ met wat lichteffecten.",
    },
    null,
  );

  // Quoted wedding, waiting for the couple.
  const femkeWedding = await b.createBooking(
    feest,
    { customerId: femke, eventType: "wedding", eventDate: "2027-08-21", venueName: "Kasteel de Haar", venueCity: "Haarzuilens", guestCount: 120, partnerName: "Bram" },
    owner,
  );
  await b.sendQuote(feest, femkeWedding.id, { lines: lines(6), depositBps: 3_000, expiresInDays: 14, notes: "Inclusief ceremoniemuziek op aanvraag." }, owner, now);

  // Sanne's wedding: accepted, artist confirmed, deposit in.
  const sanneWedding = await b.createBooking(
    feest,
    {
      customerId: sanne,
      eventType: "wedding",
      eventDate: "2027-06-12",
      startTime: "19:30",
      endTime: "01:00",
      venueName: "Landgoed Zonheuvel",
      venueCity: "Doorn",
      guestCount: 140,
      partnerName: "Daan",
    },
    owner,
  );
  await prisma.booking.update({
    where: { id: sanneWedding.id },
    data: { dos: ["Openingsdans: Perfect – Ed Sheeran", "Veel Nederlandstalig na 23:00"], donts: ["Geen schlagers"] },
  });
  const sanneQuote = await b.sendQuote(feest, sanneWedding.id, { lines: lines(6), depositBps: 3_000, expiresInDays: 14 }, owner, earlier);
  await b.acceptQuote(feest, sanneQuote.id, { actor: "customer", actorId: sanne, name: "Sanne de Vries" }, earlier);
  await b.assignArtist(feest, sanneWedding.id, sem.id, owner, earlier);
  const pending = await prisma.bookingAssignment.findFirstOrThrow({ where: { bookingId: sanneWedding.id, status: "pending" } });
  await b.respondToAssignment(pending.id, ids.get("dj.sem@feestband.local")!, { accept: true }, earlier);
  await b.recordPayment(feest, sanneWedding.id, { amountCents: sanneQuote.depositCents, kind: "deposit", method: "bank_transfer", receivedAt: earlier, reference: "NL12RABO0123456789" }, owner);

  // A past birthday: done and settled.
  const past = new Date("2026-08-01T10:00:00Z");
  const birthday = await b.createBooking(
    feest,
    { customerId: lotte, eventType: "birthday", eventDate: "2026-09-26", venueName: "Café de Zaak", venueCity: "Utrecht", guestCount: 60 },
    owner,
  );
  const bq = await b.sendQuote(feest, birthday.id, { lines: lines(4), depositBps: 0, expiresInDays: 14 }, owner, past);
  await b.acceptQuote(feest, bq.id, { actor: "agency", actorId: owner, name: "Lotte Jansen (telefonisch)" }, past);
  await b.assignArtist(feest, birthday.id, sem.id, owner, past);
  const bp = await prisma.bookingAssignment.findFirstOrThrow({ where: { bookingId: birthday.id, status: "pending" } });
  await b.respondToAssignment(bp.id, ids.get("dj.sem@feestband.local")!, { accept: true }, past);
  await b.changeBookingStatus(feest, birthday.id, "complete", { actor: "agency", actorId: owner }, now);
  await b.recordPayment(feest, birthday.id, { amountCents: bq.totalCents, kind: "balance", method: "bank_transfer", receivedAt: now }, owner);
  await b.issueInvoice(feest, birthday.id, owner, now);
  await b.changeBookingStatus(feest, birthday.id, "settle", { actor: "agency", actorId: owner }, now);

  // Rotterdam: Bram's party, accepted, no artist yet.
  const party = await b.createBooking(rot, { customerId: bram, eventType: "party", eventDate: "2027-03-14", venueCity: "Rotterdam", guestCount: 80 }, rotOwner);
  const pq = await b.sendQuote(rot, party.id, { lines: lines(5), depositBps: 2_500, expiresInDays: 14 }, rotOwner, now);
  await b.acceptQuote(rot, pq.id, { actor: "customer", actorId: bram, name: "Bram Visser" }, now);

  console.log("  created  demo artists, services and bookings");
}
