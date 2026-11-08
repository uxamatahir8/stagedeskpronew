"use server";

import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { acceptQuote, declineQuote, prisma } from "@stagedesk/db";
import { type ActionResult, runAction } from "@/lib/actions";
import { mailAgencyTeam } from "@/lib/booking-mail";
import { auth } from "@/lib/auth";
import { getSession } from "@/lib/viewer";
import { passwordProblem } from "@stagedesk/core";

/**
 * Accepting through the quote link. The secret token is what grants access,
 * like a signed link in an email; the name is recorded with the acceptance.
 */
export async function acceptQuoteByTokenAction(token: string, name: string, agreed: boolean): Promise<ActionResult> {
  const fullName = name.trim().slice(0, 191);
  if (!agreed || fullName.length < 2) return { ok: false };

  const quote = await prisma.quote.findUnique({
    where: { token },
    select: { id: true, organizationId: true, bookingId: true, booking: { select: { customerId: true } }, organization: { select: { name: true, suspendedAt: true } } },
  });
  if (!quote) return { ok: false, message: (await getTranslations("quotePage"))("notFound") };

  // Nobody at a suspended agency can follow up, so a customer can't commit to it.
  if (quote.organization.suspendedAt) return { ok: false, message: (await getTranslations("quotePage"))("agencySuspended", { agency: quote.organization.name }) };

  const session = await getSession();
  const actorId = session && session.user.id === quote.booking.customerId ? session.user.id : null;
  const t = await getTranslations("quotePage");
  const result = await runAction(
    () => acceptQuote(quote.organizationId, quote.id, { actor: "customer", actorId, name: fullName }),
    t("accepted", { agency: quote.organization.name }),
  );
  if (result.ok) await mailAgencyTeam(quote.bookingId, "quoteAccepted");
  return result;
}

/** Saying no through the quote link: the agency sees it right away instead of waiting for the quote to expire. */
export async function declineQuoteByTokenAction(token: string, reason: string): Promise<ActionResult> {
  const t = await getTranslations("quotePage");
  const quote = await prisma.quote.findUnique({
    where: { token },
    select: { id: true, organizationId: true, booking: { select: { customerId: true, customer: { select: { name: true } } } }, organization: { select: { name: true } } },
  });
  if (!quote) return { ok: false, message: t("notFound") };
  const session = await getSession();
  const actorId = session && session.user.id === quote.booking.customerId ? session.user.id : null;
  return runAction(
    () => declineQuote(quote.organizationId, quote.id, { actorId, name: quote.booking.customer?.name ?? "" }, reason.slice(0, 1000) || null).then(() => undefined),
    t("declined", { agency: quote.organization.name }),
  );
}

export type SetupAccountResult = { ok: true; next: string } | { ok: false; message: string };

/**
 * The customer creates their account from the quote link: the token proves
 * they received the email, so the address counts as confirmed. They choose a
 * password and are signed in straight away.
 */
export async function setupAccountByTokenAction(token: string, password: string, repeat: string): Promise<SetupAccountResult> {
  const t = await getTranslations("quotePage");
  const quote = await prisma.quote.findUnique({
    where: { token },
    select: { booking: { select: { trackingCode: true, customer: { select: { id: true, email: true } } } } },
  });
  const customer = quote?.booking.customer;
  if (!quote || !customer) return { ok: false, message: t("notFound") };
  const problem = passwordProblem(password);
  if (problem) return { ok: false, message: (await getTranslations("password"))(`problem_${problem}`) };
  if (password !== repeat) return { ok: false, message: t("accountPasswordMismatch") };
  if (await prisma.account.findFirst({ where: { userId: customer.id, providerId: "credential" }, select: { id: true } })) {
    return { ok: false, message: t("accountExists") };
  }

  const ctx = await auth.$context;
  await ctx.internalAdapter.linkAccount({ userId: customer.id, providerId: "credential", accountId: customer.id, password: await ctx.password.hash(password) });
  await prisma.user.update({ where: { id: customer.id }, data: { emailVerified: true } });
  await auth.api.signInEmail({ body: { email: customer.email, password }, headers: await headers() });
  return { ok: true, next: `/app/event?booking=${quote.booking.trackingCode}` };
}
