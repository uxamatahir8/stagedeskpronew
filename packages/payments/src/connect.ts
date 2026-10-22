import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { prisma, tenantDb } from "@stagedesk/db";

/**
 * Starts (or resumes) Stripe Express onboarding for the agency itself or one
 * of its artists. Agencies need card payments + transfers; artists only
 * receive transfers.
 */
export async function connectOnboardingLink(
  stripe: Stripe,
  input: { organizationId: string; artistId: string | null; email: string; returnUrl: string; refreshUrl: string },
) {
  const db = tenantDb(input.organizationId);
  let account = await db.connectedAccount.findFirst({ where: { artistId: input.artistId } });

  if (!account) {
    const created = await stripe.accounts.create(
      {
        type: "express",
        country: "NL",
        email: input.email,
        business_type: input.artistId ? "individual" : "company",
        capabilities: input.artistId
          ? { transfers: { requested: true } }
          : { card_payments: { requested: true }, transfers: { requested: true }, ideal_payments: { requested: true } },
        metadata: { organizationId: input.organizationId, artistId: input.artistId ?? "" },
      },
      { idempotencyKey: `connect-${input.organizationId}-${input.artistId ?? "agency"}` },
    );
    await db.connectedAccount.create({
      data: { id: randomUUID(), organizationId: input.organizationId, artistId: input.artistId, stripeAccountId: created.id },
    });
    account = await db.connectedAccount.findFirstOrThrow({ where: { stripeAccountId: created.id } });
  }

  const link = await stripe.accountLinks.create({
    account: account.stripeAccountId,
    type: "account_onboarding",
    return_url: input.returnUrl,
    refresh_url: input.refreshUrl,
  });
  return link.url;
}

/** Keeps our copy of an account's capabilities in step (account.updated webhook). */
export async function applyStripeAccount(account: Stripe.Account) {
  await prisma.connectedAccount.updateMany({
    where: { stripeAccountId: account.id },
    data: {
      chargesEnabled: account.charges_enabled ?? false,
      payoutsEnabled: account.payouts_enabled ?? false,
      detailsSubmitted: account.details_submitted ?? false,
    },
  });
}

/** Express dashboard for an already connected account, where they see payouts. */
export async function connectDashboardLink(stripe: Stripe, stripeAccountId: string) {
  return (await stripe.accounts.createLoginLink(stripeAccountId)).url;
}
