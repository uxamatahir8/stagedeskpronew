"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { agencyReferralCode, AgencyInviteError, createAgencyInvite, currentArtistIds } from "@stagedesk/db";
import type { ActionResult } from "@/lib/actions";
import { referralLink } from "@/lib/affiliate";
import { absoluteUrl, deliver, userLocale } from "@/lib/mail";
import { allow } from "@/lib/rate-limit";
import { requireAgency, requireViewer } from "@/lib/viewer";

const emailSchema = z.email().max(191);

async function inviteError(error: unknown): Promise<ActionResult> {
  const t = await getTranslations("agencyInvite");
  if (error instanceof AgencyInviteError) return { ok: false, message: t(`error_${error.code}`) };
  console.error("[invites] failed", error);
  return { ok: false, message: t("error_generic") };
}

/**
 * An agency invites another agency (often a partner it shares artists with).
 * The link carries the agency's referral code, so its referral reward applies.
 */
export async function inviteAgencyAction(rawEmail: string): Promise<ActionResult> {
  const { viewer, organization } = await requireAgency("agency.referrals");
  const t = await getTranslations("agencyInvite");
  const parsed = emailSchema.safeParse(rawEmail.trim());
  if (!parsed.success) return { ok: false, message: t("error_invalid") };
  if (!(await allow(`agency-invite:${viewer.user.id}`, 20, 86_400))) return { ok: false, message: t("error_limit") };
  try {
    await createAgencyInvite({ email: parsed.data, kind: "agency", inviterUserId: viewer.user.id, inviterAgencyId: organization.id });
  } catch (error) {
    return inviteError(error);
  }
  const url = referralLink(await agencyReferralCode(organization.id), "invite", "/sign-up");
  deliver({ kind: "agencyInvite", to: parsed.data, params: { locale: userLocale(await getLocale()), inviter: viewer.user.name, agency: organization.name, url } });
  revalidatePath("/[locale]/app/referrals", "page");
  return { ok: true, message: t("sent", { email: parsed.data }) };
}

/** An artist invites an agency they work with (artists often work for several). */
export async function inviteAgencyAsArtistAction(rawEmail: string): Promise<ActionResult> {
  const viewer = await requireViewer();
  const t = await getTranslations("agencyInvite");
  // Only someone with a working artist profile; a lost role or a disabled profile can't send.
  if ((await currentArtistIds(viewer.user.id)).length === 0) return { ok: false, message: t("error_notArtist") };
  const parsed = emailSchema.safeParse(rawEmail.trim());
  if (!parsed.success) return { ok: false, message: t("error_invalid") };
  if (!(await allow(`agency-invite:${viewer.user.id}`, 20, 86_400))) return { ok: false, message: t("error_limit") };
  try {
    await createAgencyInvite({ email: parsed.data, kind: "artist", inviterUserId: viewer.user.id, inviterAgencyId: null });
  } catch (error) {
    return inviteError(error);
  }
  const locale = userLocale(await getLocale());
  deliver({ kind: "agencyInvite", to: parsed.data, params: { locale, inviter: viewer.user.name, agency: null, url: absoluteUrl(locale, "/for-agencies") } });
  return { ok: true, message: t("sent", { email: parsed.data }) };
}
