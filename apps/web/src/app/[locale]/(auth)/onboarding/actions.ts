"use server";

import { cookies, headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { normalizePromoCode, parseViaCookie, viaCookie } from "@stagedesk/core";
import { attachReferral, prisma } from "@stagedesk/db";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { auth } from "@/lib/auth";
import { fieldErrorKeys, type FormState, kvkNumber, optionalText, requiredText, slugify } from "@/lib/validation";
import { getViewer } from "@/lib/viewer";

const schema = z.object({
  name: requiredText(100),
  city: optionalText(96),
  kvkNumber,
  promoCode: optionalText(24),
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
  // A partner code must belong to an approved partner; an empty field is fine.
  const promoCode = parsed.data.promoCode ? normalizePromoCode(parsed.data.promoCode) : null;
  if (parsed.data.promoCode) {
    const partner = promoCode ? await prisma.affiliate.findUnique({ where: { promoCode }, select: { status: true } }) : null;
    if (partner?.status !== "approved") return { fieldErrors: { promoCode: (await getTranslations("onboarding"))("partnerCodeUnknown") } };
  }

  const organization = await auth.api.createOrganization({
    headers: await headers(),
    body: { name, slug: await uniqueSlug(name), city: city ?? undefined, kvkNumber: kvk ?? undefined },
  });
  if (organization) {
    // Who sent them: a typed partner code, else the last referral link within the cookie window.
    const visit = parseViaCookie((await cookies()).get(viaCookie)?.value);
    await attachReferral({ agencyId: organization.id, ownerUserId: viewer.user.id, ownerEmail: viewer.user.email, visit, promoCode }).catch((error) =>
      console.error("[affiliates] referral not recorded", error),
    );
  }
  // No automatic trial: the owner chooses a plan first (plans may offer free days).
  redirect({ href: organization ? "/app/billing?welcome=1" : "/app", locale: (await getLocale()) as Locale });
  return { ok: true };
}
