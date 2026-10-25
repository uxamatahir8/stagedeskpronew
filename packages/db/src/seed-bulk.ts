import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { PrismaClient } from "./generated/prisma/client";
import { DEMO_PASSWORD } from "./seed-demo";

/**
 * Volume demo data: 100–150 of everything, so every list, filter, sort and
 * pager in the portal has something to work with. Bookings, quotes, payments,
 * claims, leads, tickets and messages go through the real functions, so the
 * data is consistent. Development only; runs once (marker: agency bulk-001).
 */

const DAY = 86_400_000;
const firstNames = ["Anna", "Bas", "Charlotte", "Daan", "Emma", "Finn", "Grace", "Hugo", "Iris", "Jesse", "Kim", "Lars", "Mila", "Noah", "Olivia", "Pieter", "Quinten", "Roos", "Sven", "Tess", "Uma", "Victor", "Wendy", "Xander", "Yara", "Zoë", "Lieke", "Thijs", "Fleur", "Ruben", "Sanne", "Joris", "Eva", "Milan", "Noor", "Stijn"];
const lastNames = ["de Jong", "Jansen", "de Vries", "van den Berg", "van Dijk", "Bakker", "Janssen", "Visser", "Smit", "Meijer", "de Boer", "Mulder", "de Groot", "Bos", "Vos", "Peters", "Hendriks", "van Leeuwen", "Dekker", "Brouwer", "de Wit", "Dijkstra", "Smits", "de Graaf", "van der Meer"];
const cities = ["Amsterdam", "Rotterdam", "Den Haag", "Utrecht", "Eindhoven", "Groningen", "Tilburg", "Almere", "Breda", "Nijmegen", "Apeldoorn", "Haarlem", "Arnhem", "Zwolle", "Leiden", "Maastricht", "Delft", "Amersfoort", "Den Bosch", "Leeuwarden"];
const venues = ["Kasteel de Haar", "Fort aan de Klop", "Landgoed Zonheuvel", "De Rode Hoed", "Jaarbeurs", "Hotel Breitner", "Theater Kikker", "Strandpaviljoen Zuid", "Boerderij Mereveld", "Villa Augustus", "Het Arsenaal", "De Kromme Watergang", "Kurhaus", "Watertoren", "Loods 6", "Grand Café Central"];
const genres = ["Top 40", "House", "Deep house", "80s", "90s", "Disco", "Nederlandstalig", "Afro house", "R&B", "Latin", "Funk", "Jazz", "Lounge", "Rock", "Hip-hop", "Techno"];
const stageWords = ["DJ", "MC", "Band", "Duo", "Trio", "Sax", "Live"];
const eventTypes = ["wedding", "corporate", "birthday", "party", "festival", "other"] as const;
const agencyWords = ["Beats", "Events", "Entertainment", "Feestmuziek", "DJ Service", "Live Music", "Party Crew", "Sound & Light", "Bookings", "Artists"];

/** Small deterministic random, so every run builds the same data set. */
function rng(seed: number) {
  let s = seed;
  const next = () => ((s = (s * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648);
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(list: readonly T[]) => list[Math.floor(next() * list.length)]!,
    some: <T>(list: readonly T[], n: number) => [...list].sort(() => next() - 0.5).slice(0, n),
  };
}

const pad = (n: number) => String(n).padStart(3, "0");
const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function seedBulk(prisma: PrismaClient, now = new Date()) {
  if (await prisma.organization.findUnique({ where: { slug: "bulk-001" }, select: { id: true } })) {
    console.log("  kept     bulk demo data");
    return;
  }
  const r = rng(2026);
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const b = await import("./bookings");
  const { submitLead, offerLead, respondToLeadOffer } = await import("./leads");
  const { openTicket, replyToTicket } = await import("./support");
  const { postMessage } = await import("./messages");
  const { submitPaymentClaim } = await import("./payment-claims");
  const plans = await prisma.plan.findMany();
  const plan = (key: string) => plans.find((p) => p.key === key)!;

  const user = async (email: string, name: string, extra: { platformRole?: string; phone?: string; password?: boolean; createdAt?: Date } = {}) => {
    const id = randomUUID();
    await prisma.user.create({
      data: {
        id,
        email,
        name,
        emailVerified: true,
        platformRole: extra.platformRole ?? null,
        phone: extra.phone ?? null,
        createdAt: extra.createdAt ?? now,
        ...(extra.password === false ? {} : { accounts: { create: { id: randomUUID(), accountId: id, providerId: "credential", password: passwordHash } } }),
      },
    });
    return id;
  };
  const person = () => `${r.pick(firstNames)} ${r.pick(lastNames)}`;
  const phone = () => `+31 6 ${r.int(10_000_000, 99_999_999)}`;

  // ── 120 agencies with owners, staff and every kind of subscription ─────────
  const statuses = ["active", "active", "active", "trialing", "past_due", "canceled", "none", "complimentary"] as const;
  const bulkAgencies: { id: string; ownerId: string; name: string }[] = [];
  for (let i = 1; i <= 120; i++) {
    const city = r.pick(cities);
    const name = `${city} ${r.pick(agencyWords)} ${pad(i)}`;
    const created = new Date(now.getTime() - r.int(5, 540) * DAY);
    const ownerId = await user(`eigenaar@bulk-${pad(i)}.local`, person(), { phone: phone(), createdAt: created });
    const id = randomUUID();
    await prisma.organization.create({
      data: {
        id,
        slug: `bulk-${pad(i)}`,
        name,
        city,
        kvkNumber: String(r.int(10_000_000, 99_999_999)),
        contactEmail: `info@bulk-${pad(i)}.local`,
        createdAt: created,
        ...(i % 23 === 0 ? { suspendedAt: new Date(now.getTime() - 3 * DAY), suspendReason: "Openstaande facturen" } : {}),
        members: { create: { id: randomUUID(), userId: ownerId, role: "agency_owner", createdAt: created } },
      },
    });
    if (i % 4 === 0) {
      const staffId = await user(`planning@bulk-${pad(i)}.local`, person(), { createdAt: created });
      await prisma.member.create({ data: { id: randomUUID(), organizationId: id, userId: staffId, role: i % 8 === 0 ? "agency_admin" : "agency_staff" } });
    }
    const status = statuses[i % statuses.length]!;
    if (status !== "none") {
      const p = plan(r.pick(["starter", "pro", "business"]));
      await prisma.subscription.create({
        data: {
          id: randomUUID(),
          organizationId: id,
          planId: p.id,
          status: status === "complimentary" ? "active" : status,
          complimentary: status === "complimentary",
          interval: i % 3 === 0 ? "year" : "month",
          trialEndsAt: status === "trialing" ? new Date(now.getTime() + r.int(1, 14) * DAY) : null,
          currentPeriodEnd: status === "active" ? new Date(now.getTime() + r.int(1, 30) * DAY) : null,
          pastDueSince: status === "past_due" ? new Date(now.getTime() - r.int(1, 10) * DAY) : null,
          createdAt: created,
        },
      });
      if (status === "trialing") await prisma.organization.update({ where: { id }, data: { trialUsedAt: created } });
    }
    bulkAgencies.push({ id, ownerId, name });
  }
  console.log("  created  120 agencies with owners and subscriptions");

  // ── Feestband Utrecht: the agency to demo every agency list with ────────────
  const feest = await prisma.organization.findUniqueOrThrow({ where: { slug: "feestband-utrecht" } });
  const ownerId = (await prisma.member.findFirstOrThrow({ where: { organizationId: feest.id, role: "agency_owner" } })).userId;
  // Unlimited plan, so the volume fits within the limits.
  await prisma.subscription.update({ where: { organizationId: feest.id }, data: { planId: plan("business").id, status: "active", complimentary: true } });

  const artists: { id: string; userId: string | null }[] = [];
  for (let i = 1; i <= 100; i++) {
    const withAccount = i <= 30;
    const name = `${r.pick(stageWords)} ${r.pick(firstNames)}${i > 36 ? ` ${pad(i)}` : ""}`;
    const userId = withAccount ? await user(`artiest${pad(i)}@feestband.local`, person()) : null;
    if (userId) await prisma.member.create({ data: { id: randomUUID(), organizationId: feest.id, userId, role: "artist" } });
    const id = randomUUID();
    await prisma.artist.create({
      data: {
        id,
        organizationId: feest.id,
        userId,
        stageName: name,
        genres: r.some(genres, r.int(1, 3)),
        defaultShareBps: r.pick([3_000, 3_500, 4_000, 4_500, 5_000]),
        active: withAccount || i % 17 !== 0,
        createdAt: new Date(now.getTime() - r.int(1, 700) * DAY),
      },
    });
    artists.push({ id, userId });
  }
  console.log("  created  100 artists");

  const serviceNames = ["DJ", "Band", "Saxofonist", "Zanger(es)", "MC", "Lichtshow", "Geluidsset", "Rookmachine", "Fotobooth", "Karaoke", "Ceremoniegeluid", "Reiskosten", "Opbouw", "Extra uur", "Draadloze microfoon"];
  const services: { name: string; unitPriceCents: number; vatBps: number; unit: string }[] = [];
  for (let i = 1; i <= 100; i++) {
    const base = serviceNames[i % serviceNames.length]!;
    const unit = r.pick(["hour", "piece", "flat"]);
    const s = { name: `${base} ${i > serviceNames.length ? `· pakket ${pad(i)}` : ""}`.trim(), unit, unitPriceCents: r.int(25, 400) * 100, vatBps: base === "Reiskosten" ? 0 : 2_100 };
    await prisma.serviceItem.create({ data: { ...s, id: randomUUID(), organizationId: feest.id, position: 10 + i } });
    services.push(s);
  }
  console.log("  created  100 services");

  const customers: string[] = [];
  for (let i = 1; i <= 150; i++) {
    const name = person();
    // About a third set up their own password; the rest sign in with a code.
    const id = await user(`klant${pad(i)}@voorbeeld-bulk.nl`, name, { phone: phone(), password: i % 3 === 0, createdAt: new Date(now.getTime() - r.int(1, 400) * DAY) });
    await prisma.member.create({ data: { id: randomUUID(), organizationId: feest.id, userId: id, role: "customer", createdAt: new Date(now.getTime() - r.int(1, 400) * DAY) } });
    customers.push(id);
  }
  console.log("  created  150 customers");

  // 180 bookings in every stage. Each gets its own day, so artists never clash.
  type Stage = "inquiry" | "quoted" | "booked" | "confirmed" | "claimed" | "completed" | "settled" | "cancelled" | "declined";
  const plan180: Stage[] = [
    ...Array<Stage>(15).fill("inquiry"),
    ...Array<Stage>(15).fill("quoted"),
    ...Array<Stage>(12).fill("booked"),
    ...Array<Stage>(16).fill("confirmed"),
    ...Array<Stage>(10).fill("claimed"),
    ...Array<Stage>(40).fill("completed"),
    ...Array<Stage>(62).fill("settled"),
    ...Array<Stage>(6).fill("cancelled"),
    ...Array<Stage>(4).fill("declined"),
  ];
  const by = { actor: "agency" as const, actorId: ownerId };
  const finished: { id: string; customerId: string; artistId: string }[] = [];
  let made = 0;
  for (const [i, stage] of plan180.entries()) {
    const past = stage === "completed" || stage === "settled";
    // Past events spread over the last 18 months, future ones over the next 14.
    const eventDay = past ? new Date(now.getTime() - (5 + i * 3) * DAY) : new Date(now.getTime() + (10 + i * 2) * DAY);
    const createdAt = new Date(eventDay.getTime() - r.int(40, 200) * DAY);
    const quotedAt = new Date(Math.min(createdAt.getTime() + 2 * DAY, now.getTime()));
    const customerId = customers[i % customers.length]!;
    const artist = artists[i % 30]!;
    const type = r.pick(eventTypes);
    const booking = await b.createBooking(
      feest.id,
      {
        customerId,
        eventType: type,
        eventDate: ymd(eventDay),
        startTime: r.pick(["19:00", "20:00", "20:30", "21:00"]),
        endTime: r.pick(["00:00", "00:30", "01:00", "02:00"]),
        venueName: r.pick(venues),
        venueCity: r.pick(cities),
        guestCount: r.int(40, 300),
        budgetCents: r.int(8, 40) * 10_000,
        partnerName: type === "wedding" ? r.pick(firstNames) : null,
        message: r.next() > 0.5 ? "Graag een DJ die de zaal goed aanvoelt en ook wat oudere hits draait." : null,
      },
      i % 5 === 0 ? null : ownerId,
    );
    await prisma.booking.update({ where: { id: booking.id }, data: { createdAt } });
    made++;
    if (stage === "inquiry") continue;
    if (stage === "declined") {
      await b.changeBookingStatus(feest.id, booking.id, "decline", { ...by, reason: "Datum al vol" }, quotedAt);
      continue;
    }
    const lines = r.some(services, r.int(2, 4)).map((s) => ({
      description: s.name,
      quantityHundredths: (s.unit === "hour" ? r.int(3, 7) : 1) * 100,
      unitPriceCents: s.unitPriceCents,
      vatBps: s.vatBps,
    }));
    const quote = await b.sendQuote(feest.id, booking.id, { lines, depositBps: r.pick([0, 2_500, 3_000, 5_000]), expiresInDays: 14 }, ownerId, stage === "quoted" ? new Date(now.getTime() - r.int(0, 10) * DAY) : quotedAt);
    if (stage === "quoted") continue;
    await b.acceptQuote(feest.id, quote.id, i % 2 ? { actor: "customer", actorId: customerId, name: "Klant (online)" } : { actor: "agency", actorId: ownerId, name: "Telefonisch akkoord" }, quotedAt);
    if (stage === "cancelled") {
      await b.changeBookingStatus(feest.id, booking.id, "cancel", { ...by, reason: "Feest gaat niet door" }, quotedAt);
      continue;
    }
    if (stage === "booked") continue;
    await b.assignArtist(feest.id, booking.id, artist.id, ownerId, quotedAt);
    const assignment = await prisma.bookingAssignment.findFirstOrThrow({ where: { bookingId: booking.id, status: "pending" } });
    await b.respondToAssignment(assignment.id, artist.userId!, { accept: true }, quotedAt);
    if (quote.depositCents > 0) {
      await b.recordPayment(feest.id, booking.id, { amountCents: quote.depositCents, kind: "deposit", method: r.pick(["bank_transfer", "bank_transfer", "cash", "card"]), receivedAt: new Date(quotedAt.getTime() + 3 * DAY), reference: `NL${r.int(10, 99)}RABO0${r.int(100_000_000, 999_999_999)}` }, ownerId);
    }
    if (stage === "claimed") {
      // The customer reports a transfer that waits for the agency to confirm.
      const outstanding = quote.totalCents - quote.depositCents;
      await submitPaymentClaim(feest.id, booking.id, customerId, { method: "bank_transfer", amountCents: Math.max(100, Math.round(outstanding / 2)), paidOn: ymd(now), reference: `Boeking ${booking.trackingCode}`, note: null }).catch(() => undefined);
      continue;
    }
    if (stage === "confirmed") continue;
    await b.changeBookingStatus(feest.id, booking.id, "complete", by, new Date(eventDay.getTime() + DAY));
    finished.push({ id: booking.id, customerId, artistId: artist.id });
    if (stage === "completed") continue;
    const rest = quote.totalCents - quote.depositCents;
    if (rest > 0) await b.recordPayment(feest.id, booking.id, { amountCents: rest, kind: "balance", method: "bank_transfer", receivedAt: new Date(eventDay.getTime() + 5 * DAY) }, ownerId);
    await b.issueInvoice(feest.id, booking.id, ownerId, new Date(eventDay.getTime() + 2 * DAY));
    await b.changeBookingStatus(feest.id, booking.id, "settle", by, new Date(eventDay.getTime() + 6 * DAY));
  }
  console.log(`  created  ${made} bookings with quotes, payments, invoices and claims`);

  // Reviews on 110 finished bookings: approved, waiting and rejected.
  const comments = ["Fantastische avond, iedereen stond te dansen!", "Precies de muziek die we wilden.", "Goed contact vooraf en op de avond zelf.", "Iets te hard in het begin, verder top.", "Een aanrader voor elke bruiloft.", "Professioneel en op tijd.", null];
  for (const [i, f] of finished.slice(0, 110).entries()) {
    if (await prisma.review.findUnique({ where: { bookingId: f.id }, select: { id: true } })) continue;
    const status = i % 9 === 0 ? "rejected" : i % 4 === 0 ? "pending" : "approved";
    await prisma.review.create({
      data: { id: randomUUID(), organizationId: feest.id, bookingId: f.id, customerId: f.customerId, artistId: f.artistId, rating: r.pick([5, 5, 5, 4, 4, 3, 2]), comment: r.pick(comments), status, moderatedAt: status === "pending" ? null : now, createdAt: new Date(now.getTime() - r.int(1, 300) * DAY) },
    });
  }
  console.log("  created  110 reviews");

  // Conversations: customer and artist threads on 75 bookings, two messages each.
  const threads = await prisma.booking.findMany({ where: { organizationId: feest.id, customerId: { not: null }, status: { in: ["booked", "confirmed", "completed"] } }, take: 75, include: { assignments: { where: { status: "accepted" }, include: { artist: true } } } });
  let messages = 0;
  for (const t of threads) {
    await postMessage({ bookingId: t.id, channel: "customer", authorId: t.customerId!, body: "Hoi! Kunnen we de openingsdans nog doorgeven?" });
    await postMessage({ bookingId: t.id, channel: "customer", authorId: ownerId, body: "Zeker, zet hem in je playlist in je account. Dan geven wij hem door." });
    messages += 2;
    const artistUser = t.assignments[0]?.artist.userId;
    if (artistUser && messages < 160) {
      await postMessage({ bookingId: t.id, channel: "artist", authorId: ownerId, body: "Laad- en losplek is aan de achterkant, bel even bij aankomst." });
      messages++;
    }
  }
  console.log(`  created  ${messages} messages`);

  // ── Platform: leads, offers and assignments ─────────────────────────────────
  const offerTo = [feest.id, ...bulkAgencies.slice(0, 20).map((a) => a.id)];
  for (let i = 1; i <= 130; i++) {
    const type = r.pick(eventTypes);
    const lead = await submitLead({
      name: person(),
      email: `lead${pad(i)}@voorbeeld-bulk.nl`,
      phone: phone(),
      locale: i % 5 === 0 ? "en" : "nl",
      eventType: type,
      eventDate: ymd(new Date(now.getTime() + (20 + i) * DAY)),
      startTime: "20:00",
      venueName: r.pick(venues),
      venueCity: r.pick(cities),
      guestCount: r.int(30, 250),
      budgetRange: r.pick(["lt_750", "750_1500", "1500_2500", "2500_4000", "gt_4000"]),
      preferredGenre: r.pick(genres),
      partnerName: type === "wedding" ? r.pick(firstNames) : null,
      ceremony: type === "wedding" ? r.next() > 0.5 : null,
      message: "We zoeken een DJ voor een avond vol feest.",
    });
    await prisma.lead.update({ where: { id: lead.id }, data: { createdAt: new Date(now.getTime() - r.int(0, 120) * DAY) } });
    if (i % 4 === 0) continue; // new
    const targets = [feest.id, ...r.some(offerTo.slice(1), 2)];
    await offerLead(lead.id, targets);
    if (i % 4 === 1) continue; // offered
    if (i % 4 === 2) {
      await respondToLeadOffer(lead.id, feest.id, i % 8 === 2, ownerId).catch(() => undefined);
      continue;
    }
    await prisma.lead.update({ where: { id: lead.id }, data: { status: "closed", closedReason: "Klant heeft zelf al iemand gevonden" } });
  }
  console.log("  created  130 leads");

  // Support tickets from agency owners, most answered by the platform admin.
  const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@stagedesk.local" } });
  const subjects = ["Factuur klopt niet", "Hoe koppel ik Stripe?", "Artiest kan niet inloggen", "Vraag over de platformkosten", "Boeking dubbel aangemaakt", "Eigen domein werkt niet", "Abonnement wijzigen", "Klant krijgt geen e-mail"];
  for (let i = 0; i < 120; i++) {
    const agency = i % 6 === 0 ? { id: feest.id, ownerId } : bulkAgencies[i % bulkAgencies.length]!;
    const ticket = await openTicket({ userId: agency.ownerId, agencyId: agency.id, subject: `${r.pick(subjects)} (#${pad(i + 1)})`, category: r.pick(["billing", "bookings", "payments", "account", "other"] as const), body: "Kunnen jullie meekijken? Alvast bedankt." });
    if (i % 3 !== 0) await replyToTicket({ reference: ticket.reference, authorId: admin.id, fromStaff: true, body: "Dank voor je bericht! Ik heb het voor je aangepast." });
    if (i % 5 === 0) await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: "closed", closedAt: now } });
  }
  console.log("  created  120 support tickets");

  // ── Partners: 110 affiliates, referrals, 150 commissions, 110 withdrawals ──
  const affiliates: string[] = [];
  for (let i = 1; i <= 110; i++) {
    const uid = await user(`partner${pad(i)}@voorbeeld-bulk.nl`, person(), { platformRole: "affiliate" });
    const status = i % 11 === 0 ? "pending" : i % 13 === 0 ? "rejected" : i % 17 === 0 ? "suspended" : "approved";
    const id = randomUUID();
    await prisma.affiliate.create({
      data: {
        id,
        userId: uid,
        status,
        code: `partner${pad(i)}`,
        promoCode: `PARTNER${pad(i)}`,
        website: `https://partner${pad(i)}.example`,
        pitch: "Ik organiseer bruiloften en bedrijfsfeesten in de regio.",
        commissionBps: i % 7 === 0 ? 3_000 : null,
        payoutMethod: r.pick(["bank_transfer", "paypal"]),
        payoutIban: "NL91ABNA0417164300",
        payoutAccountName: "Partner",
        paypalEmail: `partner${pad(i)}@voorbeeld-bulk.nl`,
        approvedAt: status === "approved" ? new Date(now.getTime() - r.int(10, 300) * DAY) : null,
        createdAt: new Date(now.getTime() - r.int(10, 320) * DAY),
      },
    });
    affiliates.push(id);
    await prisma.affiliateClick.createMany({ data: Array.from({ length: r.int(2, 12) }, () => ({ affiliateId: id, campaign: r.pick(["instagram", "nieuwsbrief", null]), landingPath: "/", createdAt: new Date(now.getTime() - r.int(0, 90) * DAY) })) });
  }
  // Referrals for 100 of the bulk agencies, each with one or two paid invoices.
  const referrals: { id: string; affiliateId: string; agencyId: string }[] = [];
  for (const [i, a] of bulkAgencies.slice(0, 100).entries()) {
    const affiliateId = affiliates[i % 90]!;
    const id = randomUUID();
    await prisma.referral.create({ data: { id, agencyId: a.id, type: "affiliate", affiliateId, source: r.pick(["cookie", "promo_code"]), campaign: r.pick(["instagram", "nieuwsbrief", null]), commissionBps: 2_500, commissionMonths: 12, firstPaidAt: new Date(now.getTime() - r.int(20, 200) * DAY), createdAt: new Date(now.getTime() - r.int(30, 220) * DAY) } });
    referrals.push({ id, affiliateId, agencyId: a.id });
  }
  const payoutStatuses = ["requested", "approved", "paid", "paid", "paid", "rejected", "failed", "cancelled"] as const;
  const payouts: { id: string; status: string; affiliateId: string }[] = [];
  for (let i = 0; i < 110; i++) {
    const status = payoutStatuses[i % payoutStatuses.length]!;
    const id = randomUUID();
    const created = new Date(now.getTime() - r.int(1, 200) * DAY);
    await prisma.affiliatePayout.create({
      data: {
        id,
        reference: `W-${pad(i + 1)}${r.int(100, 999)}`,
        affiliateId: affiliates[i % 90]!,
        amountCents: r.int(20, 400) * 100,
        method: r.pick(["bank_transfer", "paypal", "stripe"]),
        status,
        details: { iban: "NL91ABNA0417164300", name: "Partner" },
        transactionRef: status === "paid" ? `TX${r.int(100_000, 999_999)}` : null,
        rejectReason: status === "rejected" ? "Gegevens onvolledig" : null,
        error: status === "failed" ? "Rekening onbekend" : null,
        reviewedById: status === "requested" ? null : admin.id,
        reviewedAt: status === "requested" ? null : created,
        paidAt: status === "paid" ? new Date(created.getTime() + 2 * DAY) : null,
        createdAt: created,
        events: { create: { id: randomUUID(), status: "requested", actorId: null, createdAt: created } },
      },
    });
    payouts.push({ id, status, affiliateId: affiliates[i % 90]! });
  }
  for (let i = 0; i < 150; i++) {
    const ref = referrals[i % referrals.length]!;
    const base = r.int(29, 149) * 100;
    const created = new Date(now.getTime() - r.int(0, 200) * DAY);
    const payout = payouts.find((p) => p.affiliateId === ref.affiliateId && (p.status === "paid" || p.status === "requested") && i % 3 === 0);
    const status = payout ? (payout.status === "paid" ? "paid" : "requested") : r.pick(["pending", "pending", "review", "approved", "approved", "cancelled"]);
    await prisma.commission.create({
      data: {
        id: randomUUID(),
        affiliateId: ref.affiliateId,
        referralId: ref.id,
        agencyId: ref.agencyId,
        stripeInvoiceId: `in_bulk_${pad(i + 1)}`,
        baseCents: base,
        commissionBps: 2_500,
        amountCents: Math.round(base * 0.25),
        status,
        availableAt: new Date(created.getTime() + 7 * DAY),
        cancelReason: status === "cancelled" ? "Factuur terugbetaald" : null,
        payoutId: payout?.id ?? null,
        createdAt: created,
      },
    });
  }
  console.log("  created  110 partners, 100 referrals, 110 withdrawals, 150 commissions");

  // ── Waitlist, blog posts, Stripe events, audit log ─────────────────────────
  await prisma.waitlistEntry.createMany({
    data: Array.from({ length: 120 }, (_, i) => ({ id: randomUUID(), email: `wacht${pad(i + 1)}@voorbeeld-bulk.nl`, name: person(), role: r.pick(["agency", "artist", "other"]), company: r.next() > 0.5 ? `${r.pick(cities)} ${r.pick(agencyWords)}` : null, locale: r.pick(["nl", "en"]), source: r.pick(["home", "pricing", "partners", null]), createdAt: new Date(now.getTime() - r.int(0, 200) * DAY) })),
  });

  const categories = await prisma.contentCategory.findMany({ where: { kind: "blog" } });
  const topics = ["bruiloften", "bedrijfsfeesten", "offertes", "aanbetalingen", "planning", "artiesten", "marketing", "je website", "reviews", "het hoogseizoen"];
  for (let i = 1; i <= 110; i++) {
    const topic = r.pick(topics);
    const status = i % 9 === 0 ? "draft" : "published";
    const published = new Date(now.getTime() + (i % 15 === 0 ? 7 : -r.int(1, 700)) * DAY);
    await prisma.contentArticle.create({
      data: {
        id: randomUUID(),
        kind: "blog",
        slug: `tips-${slugify(topic)}-${pad(i)}`,
        categoryId: categories.length ? r.pick(categories).id : null,
        status,
        featured: false,
        publishedAt: status === "published" ? published : null,
        authorName: "Team StageDesk",
        position: 100 + i,
        nl: { title: `${i}. Praktische tips over ${topic}`, excerpt: `Wat bureaus leren over ${topic}, in vijf minuten.`, body: `## Waarom dit telt\n\nBureaus die ${topic} goed regelen, krijgen meer boekingen.\n\n## Zo pak je het aan\n\n1. Begin vroeg.\n2. Maak afspraken zichtbaar.\n3. Vraag na afloop om een review.`, seoTitle: "", seoDescription: "" },
        ...(i % 2 ? { en: { title: `${i}. Practical tips about ${topic}`, excerpt: "What agencies learn, in five minutes.", body: "## Why it matters\n\nAgencies that get this right get more bookings.", seoTitle: "", seoDescription: "" } } : {}),
      },
    });
  }

  const eventTypesStripe = ["checkout.session.completed", "customer.subscription.updated", "invoice.paid", "invoice.payment_failed", "charge.refunded", "account.updated"];
  for (let i = 1; i <= 130; i++) {
    const type = r.pick(eventTypesStripe);
    const status = i % 19 === 0 ? "failed" : i % 7 === 0 ? "ignored" : "processed";
    const received = new Date(now.getTime() - r.int(0, 60) * DAY - r.int(0, 86_000) * 1000);
    await prisma.stripeEvent.create({ data: { id: `evt_bulk_${pad(i)}`, type, status, error: status === "failed" ? "No such subscription: sub_123" : null, payload: { id: `evt_bulk_${pad(i)}`, type, data: { object: {} } }, receivedAt: received, processedAt: status === "failed" ? null : received } });
  }

  const actions = ["settings.update", "plan.save", "agency.update", "agency.suspend", "agency.reactivate", "agency.extend_trial", "agency.grant_plan", "affiliate.status", "user.disable", "lead.offer", "support.enter", "support.exit", "booking.create"];
  await prisma.auditEvent.createMany({
    data: Array.from({ length: 150 }, () => {
      const a = r.pick(bulkAgencies);
      return { actorId: admin.id, agencyId: a.id, action: r.pick(actions), targetType: "organization", targetId: a.id, data: { note: "demo" }, ip: `192.168.1.${r.int(2, 250)}`, createdAt: new Date(now.getTime() - r.int(0, 120) * DAY) };
    }),
  });
  console.log("  created  120 waitlist entries, 110 blog posts, 130 Stripe events, 150 audit events");
}
