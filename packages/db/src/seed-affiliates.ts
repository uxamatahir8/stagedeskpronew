import { randomUUID } from "node:crypto";
import type { PrismaClient } from "./generated/prisma/client";

const day = 86_400_000;

/**
 * Demo affiliate data: Pim Partner is approved, brought in Rotterdam DJ
 * Collectief (paying for three months), and has clicks across two campaigns.
 * Feestband Utrecht gets its give-a-month link. Safe to run again.
 */
export async function seedAffiliates(prisma: PrismaClient, now = new Date()) {
  const user = await prisma.user.findUnique({ where: { email: "partner@stagedesk.local" } });
  const rotterdam = await prisma.organization.findUnique({ where: { slug: "rotterdam-dj-collectief" } });
  const feestband = await prisma.organization.findUnique({ where: { slug: "feestband-utrecht" } });
  if (!user || !rotterdam || !feestband) return;

  await prisma.organization.update({ where: { id: feestband.id }, data: { referralCode: feestband.referralCode ?? "r-fb2026" } });

  const affiliate = await prisma.affiliate.upsert({
    where: { userId: user.id },
    update: {},
    create: {
      id: randomUUID(),
      userId: user.id,
      code: "pim",
      promoCode: "PIM20",
      status: "approved",
      approvedAt: new Date(now.getTime() - 120 * day),
      website: "https://pimpartner.example",
      pitch: "Ik plan zo'n 40 bruiloften per jaar en werk met een vaste groep DJ- en bandbureaus.",
      createdAt: new Date(now.getTime() - 125 * day),
    },
  });
  if ((await prisma.affiliateClick.count({ where: { affiliateId: affiliate.id } })) > 0) return;

  // Clicks spread over the last three months.
  await prisma.affiliateClick.createMany({
    data: Array.from({ length: 64 }, (_, i) => ({
      affiliateId: affiliate.id,
      campaign: i % 3 === 0 ? "nieuwsbrief" : i % 3 === 1 ? "instagram" : null,
      landingPath: "/",
      createdAt: new Date(now.getTime() - (i * 1.4 + 1) * day),
    })),
  });

  const firstPaid = new Date(now.getTime() - 95 * day);
  const referral = await prisma.referral.upsert({
    where: { agencyId: rotterdam.id },
    update: {},
    create: {
      id: randomUUID(),
      agencyId: rotterdam.id,
      type: "affiliate",
      affiliateId: affiliate.id,
      source: "cookie",
      campaign: "instagram",
      commissionBps: 2_500,
      commissionMonths: 12,
      firstPaidAt: firstPaid,
      createdAt: new Date(now.getTime() - 110 * day),
    },
  });

  // Three monthly Pro invoices of €69: one paid out, one approved, one still pending.
  const payoutId = randomUUID();
  await prisma.affiliatePayout.create({ data: { id: payoutId, affiliateId: affiliate.id, amountCents: 1_725, status: "paid", createdAt: new Date(now.getTime() - 40 * day) } });
  const invoices = [
    { ago: 95, status: "paid", payoutId },
    { ago: 65, status: "approved", payoutId: null },
    { ago: 35, status: "approved", payoutId: null },
    { ago: 5, status: "pending", payoutId: null },
  ];
  await prisma.commission.createMany({
    data: invoices.map((inv, i) => ({
      id: randomUUID(),
      affiliateId: affiliate.id,
      referralId: referral.id,
      agencyId: rotterdam.id,
      stripeInvoiceId: `in_demo_${rotterdam.id.slice(0, 8)}_${i}`,
      baseCents: 6_900,
      commissionBps: 2_500,
      amountCents: 1_725,
      status: inv.status,
      payoutId: inv.payoutId,
      availableAt: new Date(now.getTime() - (inv.ago - 30) * day),
      createdAt: new Date(now.getTime() - inv.ago * day),
    })),
  });

  await prisma.affiliateAsset.createMany({
    data: [
      { id: randomUUID(), kind: "logo", title: { nl: "StageDesk-logo (SVG en PNG)", en: "StageDesk logo (SVG and PNG)" }, url: "https://stagedesk.pro/brand/logo.zip", position: 0 },
      {
        id: randomUUID(),
        kind: "email",
        title: { nl: "E-mailtekst voor bureaus", en: "Email text for agencies" },
        description: { nl: "Korte introductie met je kortingscode.", en: "Short introduction with your promo code." },
        url: "https://stagedesk.pro/brand/email-nl-en.txt",
        position: 1,
      },
    ],
  });
  console.log("  seeded   affiliate program demo (partner@stagedesk.local)");
}
