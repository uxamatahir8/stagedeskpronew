import { existsSync } from "node:fs";

/**
 * Fills the demo agency (Feestband Utrecht) with a realistic half year of
 * bookings: inquiries, quotes, confirmed gigs, finished and settled events,
 * payments and a payment waiting for confirmation. Used for demos and the
 * website screenshots. Runs the real booking functions with past dates, so the
 * data is consistent. Customers use @voorbeeld.nl addresses. Safe to re-run:
 * bookings are only added once; the demo website is rebuilt and published
 * each time (replacing edits made to the demo agency's site).
 *
 *   pnpm db:seed-showcase
 */
const rootEnv = new URL("../../../.env", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
if (process.env["NODE_ENV"] === "production") throw new Error("Refusing to add showcase data to a production database.");

const { prisma } = await import("./client");
const { acceptQuote, assignArtist, changeBookingStatus, createBooking, recordPayment, resolveBookingCustomer, respondToAssignment, sendQuote } = await import("./bookings");
const { submitPaymentClaim } = await import("./payment-claims");

const DOMAIN = "voorbeeld.nl";
const org = await prisma.organization.findUnique({ where: { slug: "feestband-utrecht" } });
if (!org) throw new Error("Run pnpm db:seed first: the demo agency is missing.");
// Bookings are added once; the demo website below is rebuilt on every run.
const hasBookings = (await prisma.user.count({ where: { email: { endsWith: `@${DOMAIN}` } } })) > 0;
const owner = await prisma.member.findFirstOrThrow({ where: { organizationId: org.id, role: "agency_owner" } });
const artists = await prisma.artist.findMany({ where: { organizationId: org.id, active: true }, select: { id: true, userId: true, stageName: true } });
const sem = artists.find((a) => a.userId);

const DAY = 86_400_000;
const today = new Date(new Date().toISOString().slice(0, 10) + "T12:00:00Z");
const at = (days: number) => new Date(today.getTime() + days * DAY);
const ymd = (days: number) => at(days).toISOString().slice(0, 10);

type Stage = "inquiry" | "quoted" | "booked" | "confirmed" | "completed" | "settled" | "cancelled";
interface Showcase {
  name: string;
  type: "wedding" | "corporate" | "birthday" | "party" | "festival";
  /** Event day relative to today. */
  day: number;
  city: string;
  venue: string;
  guests: number;
  hours: number;
  stage: Stage;
  artist?: number;
  claim?: boolean;
  source?: "manual" | "booking_page";
}

const rows: Showcase[] = [
  { name: "Emma en Daan Bakker", type: "wedding", day: -150, city: "Utrecht", venue: "Kasteel de Haar", guests: 140, hours: 6, stage: "settled", artist: 0 },
  { name: "Jansen Installatietechniek", type: "corporate", day: -132, city: "Nieuwegein", venue: "Fort Vreeswijk", guests: 90, hours: 4, stage: "settled", artist: 1 },
  { name: "Sophie de Graaf", type: "birthday", day: -118, city: "Zeist", venue: "Het Kerckebosch", guests: 60, hours: 4, stage: "settled", artist: 0 },
  { name: "Lucas en Noa Visser", type: "wedding", day: -96, city: "Amersfoort", venue: "Landgoed de Boom", guests: 160, hours: 7, stage: "settled", artist: 2 },
  { name: "Studentenvereniging Unitas", type: "party", day: -81, city: "Utrecht", venue: "Tivoli Vredenburg", guests: 300, hours: 5, stage: "settled", artist: 0, source: "booking_page" },
  { name: "Gemeente Houten", type: "festival", day: -64, city: "Houten", venue: "Het Rond", guests: 800, hours: 6, stage: "settled", artist: 1 },
  { name: "Fleur van Dijk", type: "wedding", day: -47, city: "Doorn", venue: "Kasteel Huis Doorn", guests: 120, hours: 6, stage: "completed", artist: 2 },
  { name: "Bakker & Zonen Advocaten", type: "corporate", day: -29, city: "Utrecht", venue: "Werkspoorkathedraal", guests: 180, hours: 4, stage: "completed", artist: 0 },
  { name: "Mila Hendriks", type: "birthday", day: -12, city: "Bunnik", venue: "Buitenplaats Amelisweerd", guests: 70, hours: 4, stage: "settled", artist: 1 },
  { name: "Thomas en Julia de Wit", type: "wedding", day: 9, city: "Maarssen", venue: "Slot Zuylen", guests: 130, hours: 6, stage: "confirmed", artist: 0, claim: true },
  { name: "Rabo Utrecht Zomerborrel", type: "corporate", day: 16, city: "Utrecht", venue: "Rabo Utrechtse Heuvelrug", guests: 220, hours: 4, stage: "confirmed", artist: 1 },
  { name: "Anouk Mulder", type: "party", day: 23, city: "Utrecht", venue: "De Rode Hoed", guests: 95, hours: 5, stage: "booked" },
  { name: "Sven en Lieke Smit", type: "wedding", day: 38, city: "Driebergen", venue: "Hotel Breitner", guests: 150, hours: 7, stage: "confirmed", artist: 2 },
  { name: "Feestcommissie Oranjefeest", type: "festival", day: 52, city: "IJsselstein", venue: "Marktplein", guests: 1200, hours: 6, stage: "confirmed", artist: 0 },
  { name: "Bas Vermeulen", type: "birthday", day: 61, city: "De Bilt", venue: "Restaurant De Bilt", guests: 50, hours: 3, stage: "quoted", source: "booking_page" },
  { name: "Nina en Ruben Kok", type: "wedding", day: 74, city: "Utrecht", venue: "Paushuize", guests: 110, hours: 6, stage: "quoted" },
  { name: "TechCorp Benelux", type: "corporate", day: 88, city: "Utrecht", venue: "Jaarbeurs", guests: 400, hours: 5, stage: "booked" },
  { name: "Isa de Jong", type: "wedding", day: 103, city: "Woerden", venue: "Kasteel Woerden", guests: 135, hours: 6, stage: "inquiry", source: "booking_page" },
  { name: "Koor Cantabile", type: "party", day: 117, city: "Utrecht", venue: "Stadsschouwburg", guests: 80, hours: 4, stage: "inquiry" },
  { name: "Lars en Eva Peters", type: "wedding", day: 146, city: "Soest", venue: "Landgoed Pijnenburg", guests: 125, hours: 6, stage: "inquiry", source: "booking_page" },
  { name: "Mark Kuipers", type: "birthday", day: 33, city: "Utrecht", venue: "Café Ledig Erf", guests: 40, hours: 3, stage: "cancelled" },
];

const slug = (name: string) => name.toLowerCase().normalize("NFD").replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");
let made = 0;

for (const [i, r] of hasBookings ? [] : rows.entries()) {
  // A quote goes out a few weeks after the inquiry; most are accepted within a week.
  const inquiredDays = Math.min(r.day - 30, -5 - i);
  const quotedDays = inquiredDays + 3;
  const bookedDays = quotedDays + 5;
  const customerId = await resolveBookingCustomer(org.id, { mode: "new", name: r.name, email: `${slug(r.name)}@${DOMAIN}`, phone: null });
  if (!customerId) continue;
  const booking = await createBooking(
    org.id,
    { customerId, eventType: r.type, eventDate: ymd(r.day), startTime: r.type === "corporate" ? "18:00" : "20:00", venueName: r.venue, venueCity: r.city, guestCount: r.guests, source: r.source ?? "manual" },
    owner.userId,
  );
  await prisma.booking.update({ where: { id: booking.id }, data: { createdAt: at(inquiredDays) } });
  made++;
  if (r.stage === "inquiry") continue;

  const lines = [
    { description: "DJ, per uur", quantityHundredths: r.hours * 100, unitPriceCents: 12_500, vatBps: 2_100 },
    { description: "Geluid- en lichtset", quantityHundredths: 100, unitPriceCents: r.guests > 250 ? 45_000 : 22_500, vatBps: 2_100 },
    { description: "Reiskosten", quantityHundredths: 100, unitPriceCents: 4_500, vatBps: 2_100 },
    ...(r.type === "wedding" ? [{ description: "Ceremoniemuziek", quantityHundredths: 100, unitPriceCents: 17_500, vatBps: 2_100 }] : []),
  ];
  const quote = await sendQuote(org.id, booking.id, { lines, depositBps: 3_000, expiresInDays: 14 }, owner.userId, at(quotedDays));
  if (r.stage === "quoted") continue;

  await acceptQuote(org.id, quote.id, { actor: "customer", actorId: customerId, name: r.name }, at(Math.min(bookedDays, -1)));
  if (r.stage === "cancelled") {
    await changeBookingStatus(org.id, booking.id, "cancel", { actor: "agency", actorId: owner.userId });
    continue;
  }

  const total = (await prisma.booking.findUniqueOrThrow({ where: { id: booking.id }, select: { totalCents: true, depositCents: true } }));
  await recordPayment(org.id, booking.id, { amountCents: total.depositCents, kind: "deposit", method: "bank_transfer", receivedAt: at(Math.min(bookedDays + 4, -1)), reference: booking.trackingCode }, owner.userId);

  if (r.artist !== undefined && artists[r.artist]) {
    const artist = artists[r.artist]!;
    await assignArtist(org.id, booking.id, artist.id, owner.userId, at(Math.min(bookedDays + 1, -1)));
    const assignment = await prisma.bookingAssignment.findFirstOrThrow({ where: { bookingId: booking.id, artistId: artist.id }, orderBy: { createdAt: "desc" } });
    if (artist.userId && artist.id === sem?.id) await respondToAssignment(assignment.id, artist.userId, { accept: true });
    else {
      // These demo artists have no login, so their answer is set directly.
      await prisma.bookingAssignment.update({ where: { id: assignment.id }, data: { status: "accepted", respondedAt: at(Math.min(bookedDays + 2, -1)) } });
      await prisma.booking.update({ where: { id: booking.id }, data: { status: "confirmed" } });
    }
  }
  if (r.claim) {
    await submitPaymentClaim(org.id, booking.id, customerId, { method: "bank_transfer", amountCents: total.totalCents - total.depositCents, paidOn: ymd(-1), reference: booking.trackingCode, note: null });
  }
  if (r.stage !== "completed" && r.stage !== "settled") continue;

  await changeBookingStatus(org.id, booking.id, "complete", { actor: "agency", actorId: owner.userId });
  if (r.stage === "settled") {
    await recordPayment(org.id, booking.id, { amountCents: total.totalCents - total.depositCents, kind: "balance", method: i % 3 === 0 ? "cash" : "bank_transfer", receivedAt: at(r.day + 2), reference: booking.trackingCode }, owner.userId);
    await changeBookingStatus(org.id, booking.id, "settle", { actor: "agency", actorId: owner.userId });
  }
}

console.log(hasBookings ? "Showcase bookings are already there." : `Added ${made} showcase bookings to ${org.name}.`);

const { seedShowcaseSite } = await import("./seed-showcase-site");
await seedShowcaseSite(org.id);
console.log("Published the demo website: http://feestband-utrecht.localhost:3000");
await prisma.$disconnect();
