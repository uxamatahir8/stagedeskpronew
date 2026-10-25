import "server-only";
import { getTranslations } from "next-intl/server";
import { type CountLimit, type FeatureFlag, withinLimit } from "@stagedesk/core";
import { agencyBilling, agencyUsage, prisma } from "@stagedesk/db";
import { PaymentsError } from "@stagedesk/payments";

/**
 * Plan checks used by actions before they change anything. Each returns a
 * translated message when the action isn't allowed, or null when it is.
 */

export async function writeBlocked(organizationId: string): Promise<string | null> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { suspendedAt: true } });
  if (org?.suspendedAt) return (await getTranslations("agencySuspended"))("title");
  const { access } = await agencyBilling(organizationId);
  return access.level === "read_only" ? (await getTranslations("billing"))("readOnly") : null;
}

export async function limitBlocked(organizationId: string, key: CountLimit): Promise<string | null> {
  const blocked = await writeBlocked(organizationId);
  if (blocked) return blocked;
  const [{ limits }, usage] = await Promise.all([agencyBilling(organizationId), agencyUsage(organizationId)]);
  if (withinLimit(limits, key, usage[key])) return null;
  const t = await getTranslations("billing");
  return t("limitReached", { max: String(limits[key]), limit: t(`limit_${key}`) });
}

export async function featureBlocked(organizationId: string, flag: FeatureFlag): Promise<string | null> {
  const { limits } = await agencyBilling(organizationId);
  if (limits[flag]) return null;
  const t = await getTranslations("billing");
  return t("featureMissing", { feature: t(`flag_${flag}`) });
}

/** Translates payments-package errors for the user. */
export async function paymentsErrorMessage(error: unknown): Promise<string> {
  const t = await getTranslations("payments");
  if (error instanceof PaymentsError) return t(`errors_${error.code}`);
  console.error("[payments]", error);
  // Setup problems in the platform's Stripe account get a message that says what to do.
  const stripe = error as { type?: string; message?: string } | null;
  if (stripe?.type === "StripeInvalidRequestError" && /signed up for Connect/i.test(stripe.message ?? "")) return t("errors_connect_not_enabled");
  if (stripe?.type === "StripeAuthenticationError") return t("errors_stripe_keys");
  return (await getTranslations("auth"))("generic");
}

/** Where someone goes after a sign-in gate: a new agency owner without a plan chooses one first. */
export async function homeHref(viewer: { organization: { id: string } | null; permissions: readonly string[] }) {
  const org = viewer.organization;
  if (!org || !viewer.permissions.includes("agency.billing")) return "/app";
  const sub = await prisma.subscription.findUnique({ where: { organizationId: org.id }, select: { id: true } });
  return sub ? "/app" : "/app/billing?welcome=1";
}
