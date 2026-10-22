"use server";

import { randomUUID } from "node:crypto";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { prisma } from "@stagedesk/db";
import { fieldErrorKeys, type FormState, optionalText, requiredText } from "@/lib/validation";
import { requireAgency } from "@/lib/viewer";

const schema = z.object({
  name: requiredText(191),
  email: z.email("invalidEmail").max(191).transform((e) => e.trim().toLowerCase()),
  phone: optionalText(32),
});

export async function addCustomer(_prev: FormState, form: FormData): Promise<FormState> {
  const { db, organization } = await requireAgency("agency.customers");
  const [t, ts] = await Promise.all([getTranslations("customers"), getTranslations("agencySettings")]);

  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const keys = fieldErrorKeys(parsed.error);
    return { fieldErrors: Object.fromEntries(Object.entries(keys).map(([f, k]) => [f, ts(k as "required")])) };
  }
  const { name, email, phone } = parsed.data;

  // People are global accounts; the membership is what links them to this agency.
  const user =
    (await prisma.user.findUnique({ where: { email }, select: { id: true } })) ??
    (await prisma.user.create({ data: { id: randomUUID(), email, name, phone }, select: { id: true } }));

  const existing = await db.member.findFirst({ where: { userId: user.id }, select: { role: true } });
  if (existing) return { message: existing.role === "customer" ? t("already") : t("notCustomer") };

  // tenantDb sets organizationId itself; it's passed too so Prisma's types are satisfied.
  await db.member.create({ data: { id: randomUUID(), userId: user.id, role: "customer", organizationId: organization.id } });
  return { ok: true, message: t("added", { name }) };
}
