import { randomUUID } from "node:crypto";
import type { PlanLimits } from "@stagedesk/core";
import type { PrismaClient } from "./generated/prisma/client";

/** Starting plans; the super admin edits prices, limits and fees afterwards. */
const plans: {
  key: string;
  name: { nl: string; en: string };
  description: { nl: string; en: string };
  monthly: number;
  yearly: number;
  limits: PlanLimits;
  feeBps: number;
  recommended?: boolean;
  audience?: "agency" | "artist";
  features: { nl: string[]; en: string[] };
}[] = [
  {
    key: "starter",
    name: { nl: "Starter", en: "Starter" },
    description: { nl: "Voor de zelfstandige dj met een paar artiesten.", en: "For the independent DJ with a few artists." },
    monthly: 2_900,
    yearly: 29_000,
    feeBps: 200,
    limits: { maxArtists: 3, maxStaff: 2, maxBookingsPerMonth: 15, storageGb: 2, bookingPage: true, embedWidget: false, customDomain: false, removeBranding: false, artistSharing: false },
    features: {
      nl: ["Tot 3 artiesten", "Boekingspagina", "Offertes en facturen", "iDEAL- en kaartbetalingen"],
      en: ["Up to 3 artists", "Booking page", "Quotes and invoices", "iDEAL and card payments"],
    },
  },
  {
    key: "pro",
    name: { nl: "Pro", en: "Pro" },
    description: { nl: "Voor groeiende bureaus met een vast team.", en: "For growing agencies with a team." },
    monthly: 6_900,
    yearly: 69_000,
    feeBps: 100,
    recommended: true,
    limits: { maxArtists: 15, maxStaff: 5, maxBookingsPerMonth: 60, storageGb: 10, bookingPage: true, embedWidget: true, customDomain: false, removeBranding: false, artistSharing: true },
    features: {
      nl: ["Tot 15 artiesten", "Formulier op je eigen website", "Artiesten delen met partners", "Lagere platformkosten"],
      en: ["Up to 15 artists", "Form on your own website", "Share artists with partners", "Lower platform fee"],
    },
  },
  {
    key: "business",
    name: { nl: "Business", en: "Business" },
    description: { nl: "Voor grote bureaus: onbeperkt en zonder platformkosten.", en: "For large agencies: unlimited, no platform fee." },
    monthly: 14_900,
    yearly: 149_000,
    feeBps: 0,
    limits: { maxArtists: null, maxStaff: null, maxBookingsPerMonth: null, storageGb: 100, bookingPage: true, embedWidget: true, customDomain: true, removeBranding: true, artistSharing: true },
    features: {
      nl: ["Onbeperkt artiesten en boekingen", "Eigen domein", "Zonder StageDesk-vermelding", "Geen platformkosten"],
      en: ["Unlimited artists and bookings", "Custom domain", "No StageDesk branding", "No platform fee"],
    },
  },
  {
    key: "artist",
    audience: "artist",
    name: { nl: "Artiest", en: "Artist" },
    description: { nl: "Voor zelfstandige artiesten: een openbaar profiel dat klanten direct boeken.", en: "For independent artists: a public profile customers book directly." },
    monthly: 1_900,
    yearly: 19_000,
    feeBps: 200,
    limits: { maxArtists: 1, maxStaff: 1, maxBookingsPerMonth: null, storageGb: 2, bookingPage: false, embedWidget: false, customDomain: false, removeBranding: false, artistSharing: false },
    features: {
      nl: ["In de artiestengids", "Optredens met vaste prijs die klanten bestellen", "Direct boeken en betalen", "Reviews op je profiel"],
      en: ["Listed in the artist directory", "Fixed-price gigs customers order", "Direct booking and payment", "Reviews on your profile"],
    },
  },
];

export async function seedPlans(prisma: PrismaClient) {
  // Plans the admin already has are kept as they are; only missing ones are added.
  const existing = new Set((await prisma.plan.findMany({ select: { key: true } })).map((p) => p.key));
  let created = 0;
  for (const [position, p] of plans.entries()) {
    if (existing.has(p.key)) continue;
    created++;
    await prisma.plan.create({
      data: {
        id: randomUUID(),
        key: p.key,
        name: p.name,
        description: p.description,
        monthlyPriceCents: p.monthly,
        yearlyPriceCents: p.yearly,
        trialDays: 14,
        features: p.features,
        limits: p.limits,
        feeRule: p.feeBps === 0 ? { type: "none", percentageBps: 0, fixedCents: 0, minCents: null, maxCents: null } : { type: "percentage", percentageBps: p.feeBps, fixedCents: 0, minCents: null, maxCents: null },
        recommended: p.recommended ?? false,
        audience: p.audience ?? "agency",
        position,
      },
    });
  }
  console.log(created ? `  created  ${created} plans` : "  kept     plans");
}
