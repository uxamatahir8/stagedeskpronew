"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { audit, createSoloArtistForPerson, SoloArtistError } from "@stagedesk/db";
import type { ActionResult } from "@/lib/actions";
import { deliver } from "@/lib/mail";
import { hasPassword, passwordSetupUrl } from "@/lib/password-setup";
import { clientIp } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/viewer";

const schema = z.object({
  name: z.string().trim().min(2).max(191),
  email: z.email().max(191),
  stageName: z.string().trim().min(1).max(120),
  city: z.string().trim().max(96),
  genres: z.string().max(500),
  locale: z.enum(["nl", "en"]),
});

export type IndependentArtistInput = z.input<typeof schema>;

/**
 * A platform admin sets up an independent artist for someone. A new account
 * gets an email with a one-time link to choose a password; an existing one
 * just finds the business in their account switcher.
 */
export async function createIndependentArtistAction(input: IndependentArtistInput): Promise<ActionResult> {
  const viewer = await requirePermission("platform.agencies");
  const t = await getTranslations("soloAdmin");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("invalid") };
  const d = parsed.data;
  try {
    const result = await createSoloArtistForPerson({
      name: d.name,
      email: d.email,
      stageName: d.stageName,
      city: d.city || null,
      genres: d.genres.split(",").map((g) => g.trim()).filter(Boolean),
      locale: d.locale,
    });
    if (!(await hasPassword(result.user.id))) {
      deliver({ kind: "accountSetup", to: result.user.email, params: { locale: d.locale, name: d.name.split(/\s+/)[0] ?? d.name, url: await passwordSetupUrl(result.user.id, d.locale) } });
    }
    await audit({ actorId: viewer.user.id, action: "artist.create_independent", agencyId: result.organization.id, targetType: "user", targetId: result.user.id, data: { email: result.user.email, newUser: result.newUser }, ip: clientIp(await headers()) });
    revalidatePath("/[locale]/app/independent-artists", "page");
    revalidatePath("/[locale]/app/users", "page");
    return { ok: true, message: t(result.newUser ? "createdNew" : "createdExisting", { name: d.stageName, email: result.user.email }) };
  } catch (error) {
    if (error instanceof SoloArtistError) return { ok: false, message: t(`error_${error.code}`) };
    throw error;
  }
}
