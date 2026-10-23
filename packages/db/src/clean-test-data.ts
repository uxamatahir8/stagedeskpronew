import { existsSync } from "node:fs";

/**
 * Removes what e2e tests and smoke scripts leave behind in the dev database:
 * accounts on the test email domains, the agencies they own, their bookings
 * (with payments, invoices and ledger rows) and their partner accounts.
 * Demo accounts and anything else are kept. Prints counts only, unless run with --yes.
 *
 *   pnpm db:clean-test          # what would be removed
 *   pnpm db:clean-test --yes    # remove it
 */
const rootEnv = new URL("../../../.env", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
if (process.env["NODE_ENV"] === "production") throw new Error("Refusing to clean a production database.");

const { prisma } = await import("./client");

/** Email domains used only by tests (see apps/web/e2e and scripts/smoke-*.sh). */
const testDomains = ["test.local", "e2e-partners.nl", "e2e-bureau.nl", "e2e-beheer.nl"];
const apply = process.argv.includes("--yes");

const users = await prisma.user.findMany({
  // `not` alone would skip accounts without a platform role (SQL NULL), so both are listed.
  where: { AND: [{ OR: testDomains.map((d) => ({ email: { endsWith: `@${d}` } })) }, { OR: [{ platformRole: null }, { platformRole: { not: "platform_admin" } }] }] },
  select: { id: true },
});
// Admins created by tests are matched separately so a real admin is never caught by a domain slip.
const testAdmins = await prisma.user.findMany({ where: { platformRole: "platform_admin", email: { endsWith: "@e2e-beheer.nl" } }, select: { id: true } });
const userIds = [...users, ...testAdmins].map((u) => u.id);

// Agencies whose only owner is a test account.
const owned = await prisma.member.findMany({ where: { userId: { in: userIds }, role: "agency_owner" }, select: { organizationId: true } });
const orgIds = [...new Set(owned.map((m) => m.organizationId))];

const bookings = await prisma.booking.findMany({ where: { OR: [{ organizationId: { in: orgIds } }, { customerId: { in: userIds } }] }, select: { id: true, trackingCode: true } });
const bookingIds = bookings.map((b) => b.id);
const payments = await prisma.payment.findMany({ where: { OR: [{ bookingId: { in: bookingIds } }, { organizationId: { in: orgIds } }] }, select: { id: true } });
const paymentIds = payments.map((p) => p.id);
const affiliates = await prisma.affiliate.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
const affiliateIds = affiliates.map((a) => a.id);
const artists = await prisma.artist.findMany({ where: { OR: [{ userId: { in: userIds } }, { organizationId: { in: orgIds } }] }, select: { id: true } });
const artistIds = artists.map((a) => a.id);
// Invitations and blog comments carry an email without needing an account.
const onTestDomain = (field: "email" | "authorEmail") => testDomains.map((d) => ({ [field]: { endsWith: `@${d}` } }));
const invitations = await prisma.invitation.count({ where: { OR: onTestDomain("email") } });
const comments = await prisma.blogComment.count({ where: { OR: onTestDomain("authorEmail") } });
const leads = await prisma.lead.count({ where: { OR: onTestDomain("email") } });

console.log(`Test accounts: ${userIds.length}`);
console.log(`Agencies owned by test accounts: ${orgIds.length}`);
console.log(`Bookings: ${bookingIds.length}, payments: ${paymentIds.length}`);
console.log(`Partner accounts: ${affiliateIds.length}, artist profiles: ${artistIds.length}`);
console.log(`Invitations: ${invitations}, blog comments: ${comments}, leads: ${leads}`);

if (!apply) {
  console.log("\nNothing removed. Run again with --yes to remove these.");
} else {
  await prisma.$transaction(
    async (tx) => {
      // Money records point at bookings and payments with Restrict, so they go first.
      await tx.ledgerEntry.deleteMany({ where: { OR: [{ bookingId: { in: bookingIds } }, { paymentId: { in: paymentIds } }, { organizationId: { in: orgIds } }] } });
      await tx.invoice.deleteMany({ where: { OR: [{ bookingId: { in: bookingIds } }, { organizationId: { in: orgIds } }] } });
      await tx.payment.deleteMany({ where: { id: { in: paymentIds } } });
      await tx.bookingAssignment.deleteMany({ where: { OR: [{ bookingId: { in: bookingIds } }, { artistId: { in: artistIds } }] } });
      await tx.booking.deleteMany({ where: { id: { in: bookingIds } } });
      // Partner records: commissions and payouts before their referrals and partner.
      await tx.commission.deleteMany({ where: { OR: [{ affiliateId: { in: affiliateIds } }, { referral: { agencyId: { in: orgIds } } }] } });
      await tx.affiliatePayout.deleteMany({ where: { affiliateId: { in: affiliateIds } } });
      await tx.referral.deleteMany({ where: { OR: [{ affiliateId: { in: affiliateIds } }, { agencyId: { in: orgIds } }] } });
      await tx.affiliate.deleteMany({ where: { id: { in: affiliateIds } } });
      await tx.organization.deleteMany({ where: { id: { in: orgIds } } });
      await tx.user.deleteMany({ where: { id: { in: userIds } } });
      await tx.invitation.deleteMany({ where: { OR: onTestDomain("email") } });
      await tx.blogComment.deleteMany({ where: { OR: onTestDomain("authorEmail") } });
      // Their offers go with them.
      await tx.lead.deleteMany({ where: { OR: onTestDomain("email") } });
      // Notifications for demo accounts that pointed at the removed bookings.
      for (const b of bookings) await tx.notification.deleteMany({ where: { url: { contains: b.trackingCode } } });
    },
    { timeout: 60_000 },
  );
  console.log("\nRemoved.");
}
await prisma.$disconnect();
