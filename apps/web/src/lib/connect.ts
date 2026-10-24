import "server-only";
import { getStripe, syncStripeAccount } from "@stagedesk/payments";

/**
 * While Stripe onboarding is unfinished, asks Stripe directly: someone coming
 * back from onboarding shouldn't wait for the webhook. Returns true when it refreshed.
 */
export async function refreshIncompleteAccount(account: { stripeAccountId: string; detailsSubmitted: boolean; payoutsEnabled: boolean } | null | undefined) {
  if (!account || (account.detailsSubmitted && account.payoutsEnabled)) return false;
  const stripe = await getStripe();
  if (!stripe) return false;
  try {
    await syncStripeAccount(stripe, account.stripeAccountId);
    return true;
  } catch (error) {
    console.error("[connect] account refresh failed", error);
    return false;
  }
}
