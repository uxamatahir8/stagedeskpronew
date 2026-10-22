"use server";

import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@stagedesk/db";
import { connectDashboardLink, connectOnboardingLink, getStripe } from "@stagedesk/payments";
import type { RedirectResult } from "@/components/redirect-button";
import { paymentsErrorMessage } from "@/lib/billing";
import { absoluteUrl } from "@/lib/mail";
import { requireAgency } from "@/lib/viewer";

/** The signed-in artist's profile at their current agency. */
async function ownArtist() {
  const { viewer, organization } = await requireAgency("artist.earnings");
  const artist = await prisma.artist.findFirst({
    where: { organizationId: organization.id, userId: viewer.user.id },
    include: { connectedAccount: true },
  });
  return { viewer, organization, artist };
}

export async function connectArtistAction(): Promise<RedirectResult> {
  const { viewer, organization, artist } = await ownArtist();
  const stripe = getStripe();
  if (!stripe || !artist) return { message: (await getTranslations("payments"))("stripeMissing") };
  const locale = await getLocale();
  try {
    return {
      url: await connectOnboardingLink(stripe, {
        organizationId: organization.id,
        artistId: artist.id,
        email: viewer.user.email,
        returnUrl: absoluteUrl(locale, "/app/earnings"),
        refreshUrl: absoluteUrl(locale, "/app/earnings"),
      }),
    };
  } catch (error) {
    return { message: await paymentsErrorMessage(error) };
  }
}

export async function artistDashboardAction(): Promise<RedirectResult> {
  const { artist } = await ownArtist();
  const stripe = getStripe();
  if (!stripe || !artist?.connectedAccount) return { message: (await getTranslations("payments"))("stripeMissing") };
  try {
    return { url: await connectDashboardLink(stripe, artist.connectedAccount.stripeAccountId) };
  } catch (error) {
    return { message: await paymentsErrorMessage(error) };
  }
}
