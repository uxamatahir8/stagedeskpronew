"use server";

import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { prisma } from "@stagedesk/db";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { auth } from "@/lib/auth";
import { fieldErrorKeys, type FormState, kvkNumber, optionalText, requiredText, slugify } from "@/lib/validation";
import { getViewer } from "@/lib/viewer";

const schema = z.object({
  name: requiredText(100),
  city: optionalText(96),
  kvkNumber,
});

async function uniqueSlug(name: string) {
  const base = slugify(name) || "bureau";
  for (let i = 1; i < 50; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    if (!(await prisma.organization.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

export async function createAgency(_prev: FormState, form: FormData): Promise<FormState> {
  const viewer = await getViewer();
  if (!viewer) return { message: "unauthenticated" };
  if (viewer.role) redirect({ href: "/app", locale: (await getLocale()) as Locale });

  const t = await getTranslations("agencySettings");
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    const keys = fieldErrorKeys(parsed.error);
    return { fieldErrors: Object.fromEntries(Object.entries(keys).map(([f, k]) => [f, t(k as "required")])) };
  }

  const { name, city, kvkNumber: kvk } = parsed.data;
  await auth.api.createOrganization({
    headers: await headers(),
    body: { name, slug: await uniqueSlug(name), city: city ?? undefined, kvkNumber: kvk ?? undefined },
  });
  redirect({ href: "/app", locale: (await getLocale()) as Locale });
  return { ok: true };
}
