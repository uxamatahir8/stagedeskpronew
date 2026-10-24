"use server";

import { randomUUID } from "node:crypto";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { parseEuros } from "@stagedesk/core";
import { getSetting } from "@stagedesk/db";
import type { ActionResult } from "@/lib/actions";
import { requireAgency } from "@/lib/viewer";

const schema = z.object({
  id: z.string().max(64).nullable(),
  name: z.string().trim().min(1).max(191),
  description: z.string().max(2000).nullable(),
  unit: z.enum(["hour", "piece", "flat"]),
  price: z.string(),
  vatBps: z.number().int(),
});

export async function saveServiceAction(input: z.input<typeof schema>): Promise<ActionResult> {
  const { organization, db } = await requireAgency("agency.services");
  const [t, tb] = await Promise.all([getTranslations("services"), getTranslations("newBooking")]);
  const parsed = schema.safeParse(input);
  const unitPriceCents = parsed.success ? parseEuros(parsed.data.price) : null;
  const { vatRatesBps } = await getSetting("bookings.defaults");
  if (!parsed.success || unitPriceCents === null || !vatRatesBps.includes(parsed.data.vatBps)) {
    return { ok: false, message: tb("invalidPrice") };
  }
  const { id, ...data } = parsed.data;
  const values = { name: data.name, description: data.description?.trim() || null, unit: data.unit, unitPriceCents, vatBps: data.vatBps };

  if (id) {
    await db.serviceItem.updateMany({ where: { id }, data: values });
  } else {
    const count = await db.serviceItem.count();
    await db.serviceItem.create({ data: { ...values, id: randomUUID(), position: count, organizationId: organization.id } });
  }
  return { ok: true, message: t("saved") };
}

export async function archiveServiceAction(id: string): Promise<ActionResult> {
  const { db } = await requireAgency("agency.services");
  await db.serviceItem.updateMany({ where: { id }, data: { active: false } });
  return { ok: true, message: (await getTranslations("services"))("archived") };
}
