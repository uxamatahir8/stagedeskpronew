"use server";

import { getTranslations } from "next-intl/server";
import { acceptQuote, prisma } from "@stagedesk/db";
import { type ActionResult, runAction } from "@/lib/actions";
import { getSession } from "@/lib/viewer";

/**
 * Accepting through the quote link. The secret token is what grants access,
 * like a signed link in an email; the name is recorded with the acceptance.
 */
export async function acceptQuoteByTokenAction(token: string, name: string, agreed: boolean): Promise<ActionResult> {
  const fullName = name.trim().slice(0, 191);
  if (!agreed || fullName.length < 2) return { ok: false };

  const quote = await prisma.quote.findUnique({
    where: { token },
    select: { id: true, organizationId: true, booking: { select: { customerId: true } }, organization: { select: { name: true } } },
  });
  if (!quote) return { ok: false, message: (await getTranslations("quotePage"))("notFound") };

  const session = await getSession();
  const actorId = session && session.user.id === quote.booking.customerId ? session.user.id : null;
  const t = await getTranslations("quotePage");
  return runAction(
    () => acceptQuote(quote.organizationId, quote.id, { actor: "customer", actorId, name: fullName }),
    t("accepted", { agency: quote.organization.name }),
  );
}
