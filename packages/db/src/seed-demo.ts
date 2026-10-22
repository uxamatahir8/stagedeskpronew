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
}
