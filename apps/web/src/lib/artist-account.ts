import "server-only";

import { randomUUID } from "node:crypto";
import { notify, prisma } from "@stagedesk/db";
import { emailArtists } from "./artist-mail";
import { deliver, userLocale } from "./mail";
import { passwordSetupUrl } from "./password-setup";

/** `code` says why, for a translated message: artistAccount.error_<code>. */
export class ArtistAccountError extends Error {
  constructor(readonly code: "other_role" | "already_linked") {
    super(`Artist account: ${code}`);
    this.name = "ArtistAccountError";
  }
}

/** Create or link the artist login immediately and email a one-time password setup link for new passwordless users. */
export async function ensureArtistAccount(input: { organizationId: string; email: string; name: string; locale: string }) {
  const email = input.email.trim().toLowerCase();
  let user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, locale: true, accounts: { where: { providerId: "credential" }, select: { id: true }, take: 1 } } });
  const userId = user?.id ?? randomUUID();
  const member = user ? await prisma.member.findUnique({ where: { organizationId_userId: { organizationId: input.organizationId, userId } }, select: { role: true } }) : null;
  if (member && member.role !== "artist") throw new ArtistAccountError("other_role");
  if (await prisma.artist.findFirst({ where: { organizationId: input.organizationId, userId }, select: { id: true } })) throw new ArtistAccountError("already_linked");

  await prisma.$transaction(async (tx) => {
    if (!user) {
      await tx.user.create({ data: { id: userId, name: input.name.trim(), email, emailVerified: true, locale: userLocale(input.locale) } });
    }
    if (!member) await tx.member.create({ data: { id: randomUUID(), organizationId: input.organizationId, userId, role: "artist" } });
  });
  user ??= { id: userId, name: input.name.trim(), locale: userLocale(input.locale), accounts: [] };

  const needsPassword = user.accounts.length === 0;
  if (needsPassword) {
    const locale = userLocale(user.locale ?? input.locale);
    deliver({ kind: "artistAccountSetup", to: email, params: { locale, name: user.name, url: await passwordSetupUrl(userId, locale) } });
  }
  return { userId, email, setupSent: needsPassword };
}

/** A fresh first-password link for an artist who hasn't set one yet (the earlier one lasts 24 hours). */
export async function resendArtistSetup(user: { id: string; email: string; name: string; locale: string | null }) {
  const locale = userLocale(user.locale);
  return deliver({ kind: "artistAccountSetup", to: user.email, params: { locale, name: user.name, url: await passwordSetupUrl(user.id, locale) } });
}

/**
 * Requests made before this profile had a login reach the artist now, with
 * the same email and notification as a new one. The email's outbox key stops a
 * second copy if a request was already mailed to them.
 */
export async function announceOpenRequests(artistId: string, userId: string) {
  const open = await prisma.bookingAssignment.findMany({
    where: { artistId, status: "pending", booking: { status: { in: ["booked", "confirmed"] } } },
    select: { id: true, booking: { select: { trackingCode: true, organization: { select: { name: true } } } } },
  });
  for (const a of open) {
    const code = a.booking.trackingCode;
    if ((await prisma.notification.count({ where: { userId, type: "gig_request", url: `/app/gigs/${code}` } })) === 0) {
      await notify([userId], { type: "gig_request", data: { name: a.booking.organization.name, code }, url: `/app/gigs/${code}` });
    }
  }
  await emailArtists(open.map((a) => a.id), "new");
  return open.length;
}
