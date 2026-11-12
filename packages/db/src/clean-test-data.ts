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
const { purgeInventory } = await import("./inventory");

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

// Agencies and independent businesses whose owner is a test account.
// Independent artists own their business through the solo_artist role.
const owned = await prisma.member.findMany({ where: { userId: { in: userIds }, role: { in: ["agency_owner", "solo_artist"] } }, select: { organizationId: true } });
const orgIds = [...new Set(owned.map((m) => m.organizationId))];

const bookings = await prisma.booking.findMany({ where: { OR: [{ organizationId: { in: orgIds } }, { customerId: { in: userIds } }] }, select: { id: true, trackingCode: true } });
const bookingIds = bookings.map((b) => b.id);
const payments = await prisma.payment.findMany({ where: { OR: [{ bookingId: { in: bookingIds } }, { organizationId: { in: orgIds } }] }, select: { id: true } });
const paymentIds = payments.map((p) => p.id);
const affiliates = await prisma.affiliate.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
const affiliateIds = affiliates.map((a) => a.id);
// Also profiles e2e tests made at demo agencies ("E2E …") whose test account is already gone:
// left behind they fill the agency's artist limit, and later runs can't add one.
const artists = await prisma.artist.findMany({ where: { OR: [{ userId: { in: userIds } }, { organizationId: { in: orgIds } }, { userId: null, stageName: { startsWith: "E2E " } }] }, select: { id: true } });
const artistIds = artists.map((a) => a.id);
// Invitations and blog comments carry an email without needing an account.
const onTestDomain = (field: "email" | "authorEmail") => testDomains.map((d) => ({ [field]: { endsWith: `@${d}` } }));
const invitations = await prisma.invitation.count({ where: { OR: onTestDomain("email") } });
const comments = await prisma.blogComment.count({ where: { OR: onTestDomain("authorEmail") } });
const leads = await prisma.lead.count({ where: { OR: onTestDomain("email") } });
// Website pages made by the e2e tests (their slugs start with e2e-).
const testPages = await prisma.page.findMany({ where: { slugNl: { startsWith: "e2e-" } }, select: { id: true } });
const testPageIds = testPages.map((p) => p.id);

console.log(`Test accounts: ${userIds.length}`);
console.log(`Agencies owned by test accounts: ${orgIds.length}`);
console.log(`Bookings: ${bookingIds.length}, payments: ${paymentIds.length}`);
console.log(`Partner accounts: ${affiliateIds.length}, artist profiles: ${artistIds.length}`);
console.log(`Invitations: ${invitations}, blog comments: ${comments}, leads: ${leads}, test pages: ${testPageIds.length}`);

if (!apply) {
  console.log("\nNothing removed. Run again with --yes to remove these.");
} else {
  await prisma.$transaction(
    async (tx) => {
      // Money records point at bookings and payments with Restrict, so they go first.
      await tx.ledgerEntry.deleteMany({ where: { OR: [{ bookingId: { in: bookingIds } }, { paymentId: { in: paymentIds } }, { organizationId: { in: orgIds } }] } });
      await tx.financialOperation.deleteMany({ where: { organizationId: { in: orgIds } } });
      await tx.invoice.deleteMany({ where: { OR: [{ bookingId: { in: bookingIds } }, { organizationId: { in: orgIds } }] } });
      await tx.payment.deleteMany({ where: { id: { in: paymentIds } } });
      await tx.bookingAssignment.deleteMany({ where: { OR: [{ bookingId: { in: bookingIds } }, { artistId: { in: artistIds } }] } });
      // Packing lines point at bookings with Restrict; the agencies' own equipment goes too.
      await tx.bookingEquipment.deleteMany({ where: { bookingId: { in: bookingIds } } });
      await purgeInventory(tx, orgIds);
      // Promo codes the promo spec adds (codes start with E2E-), on demo agencies and the platform.
      await tx.bookingPromoCode.deleteMany({ where: { code: { startsWith: "E2E-" } } });
      await tx.platformPromoCode.deleteMany({ where: { code: { startsWith: "E2E-" } } });
      // Equipment the inventory spec adds to the demo agency (codes start with E2E-), once its bookings are gone.
      const e2eItems = await tx.equipmentItem.findMany({ where: { code: { startsWith: "E2E-" } }, select: { id: true } });
      const e2eIds = e2eItems.map((i) => i.id);
      if ((await tx.bookingEquipment.count({ where: { itemId: { in: e2eIds } } })) === 0) {
        await tx.equipmentEvent.deleteMany({ where: { itemId: { in: e2eIds } } });
        await tx.equipmentPackageLine.deleteMany({ where: { OR: [{ itemId: { in: e2eIds } }, { package: { name: { startsWith: "E2E " } } }, { category: { name: { startsWith: "E2E " } } }] } });
        await tx.equipmentPackage.deleteMany({ where: { name: { startsWith: "E2E " } } });
        await tx.equipmentItem.updateMany({ where: { id: { in: e2eIds } }, data: { containerId: null } });
        await tx.equipmentItem.deleteMany({ where: { id: { in: e2eIds } } });
        await tx.equipmentCategory.deleteMany({ where: { name: { startsWith: "E2E " }, items: { none: {} } } });
      }
      await tx.booking.deleteMany({ where: { id: { in: bookingIds } } });
      // Test artists' profiles at demo agencies: deleting the account only unlinks them, so they go here.
      // A profile that still has money history (ledger rows on a demo booking) is kept.
      const withHistory = new Set((await tx.ledgerEntry.findMany({ where: { artistId: { in: artistIds } }, select: { artistId: true } })).map((l) => l.artistId));
      await tx.artist.deleteMany({ where: { id: { in: artistIds.filter((id) => !withHistory.has(id)) } } });
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
      await tx.legalAcceptance.deleteMany({ where: { pageId: { in: testPageIds } } });
      await tx.page.updateMany({ where: { id: { in: testPageIds } }, data: { publishedVersionId: null } });
      await tx.page.deleteMany({ where: { id: { in: testPageIds } } });
      // The communication spec writes on a demo booking, ending each message with its run id (Date.now() in base 36).
      await tx.$executeRaw`DELETE FROM booking_messages WHERE body REGEXP ${" m[a-z0-9]{7}$"}`;
      // Notifications for demo accounts that pointed at the removed bookings.
      for (const b of bookings) await tx.notification.deleteMany({ where: { url: { contains: b.trackingCode } } });
    },
    { timeout: 60_000 },
  );
  console.log("\nRemoved.");
}
await prisma.$disconnect();
