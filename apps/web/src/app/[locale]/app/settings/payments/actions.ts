"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { audit, deleteSecret, secretKeys, setSecret } from "@stagedesk/db";
import { createStripe, getStripe, resetStripeConfig } from "@stagedesk/payments";
import type { ActionResult } from "@/lib/actions";
import { clientIp } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/viewer";

const patterns = {
  secretKey: /^(sk|rk)_(test|live)_[A-Za-z0-9]{10,}$/,
  publishableKey: /^pk_(test|live)_[A-Za-z0-9]{10,}$/,
  webhookSecret: /^whsec_[A-Za-z0-9]{10,}$/,
};
const modeOf = (key: string) => (key.includes("_live_") ? "live" : "test");

export type StripeKeysInput = { secretKey: string; publishableKey: string; webhookSecret: string };

/**
 * Saves the Stripe keys the admin typed (empty fields keep the saved value).
 * A new secret key is tried against Stripe first, so a typo never replaces a
 * working key. Values are encrypted; only a hint is ever shown again.
 */
export async function saveStripeKeysAction(input: StripeKeysInput): Promise<ActionResult> {
  const viewer = await requirePermission("platform.settings");
  const t = await getTranslations("paymentSetup");
  const values = { secretKey: input.secretKey.trim(), publishableKey: input.publishableKey.trim(), webhookSecret: input.webhookSecret.trim() };
  const given = (Object.keys(values) as (keyof typeof values)[]).filter((k) => values[k]);
  if (given.length === 0) return { ok: false, message: t("nothingToSave") };
  for (const k of given) if (!patterns[k].test(values[k])) return { ok: false, message: t(`invalid_${k}`) };
  if (values.secretKey && values.publishableKey && modeOf(values.secretKey) !== modeOf(values.publishableKey)) return { ok: false, message: t("modeMismatch") };

  if (values.secretKey) {
    try {
      await createStripe(values.secretKey).balance.retrieve();
    } catch {
      return { ok: false, message: t("keyRejected") };
    }
  }
  for (const k of given) await setSecret(`stripe.${k}`, values[k], viewer.user.id);
  resetStripeConfig();
  // Which keys changed, never their values.
  await audit({ actorId: viewer.user.id, action: "settings.stripe_keys", data: { saved: given }, ip: clientIp(await headers()) });
  revalidatePath("/[locale]/app/settings/payments", "page");
  return { ok: true, message: t("saved") };
}

/** Removes the keys saved in the dashboard; STRIPE_* from .env apply again if set. */
export async function removeStripeKeysAction(): Promise<ActionResult> {
  const viewer = await requirePermission("platform.settings");
  const t = await getTranslations("paymentSetup");
  for (const key of secretKeys) await deleteSecret(key);
  resetStripeConfig();
  await audit({ actorId: viewer.user.id, action: "settings.stripe_keys", data: { removed: true }, ip: clientIp(await headers()) });
  revalidatePath("/[locale]/app/settings/payments", "page");
  return { ok: true, message: t("removed") };
}

/** Calls Stripe with the active key and reports the account it belongs to. */
export async function testStripeAction(): Promise<ActionResult> {
  await requirePermission("platform.settings");
  const t = await getTranslations("paymentSetup");
  const stripe = await getStripe();
  if (!stripe) return { ok: false, message: t("notConfigured") };
  try {
    const account = await stripe.accounts.retrieveCurrent();
    const name = account.settings?.dashboard?.display_name || account.business_profile?.name || account.id;
    return { ok: true, message: t("testOk", { name, country: account.country ?? "—" }) };
  } catch {
    return { ok: false, message: t("testFailed") };
  }
}
