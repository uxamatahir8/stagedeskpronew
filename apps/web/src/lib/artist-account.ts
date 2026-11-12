import { artistAssignableStatuses } from "@stagedesk/core";
import "server-only";

import { randomUUID } from "node:crypto";
import { notify, prisma } from "@stagedesk/db";
import { emailArtists } from "./artist-mail";
import { accepted, deliver, userLocale } from "./mail";
import { passwordSetupUrl } from "./password-setup";

/** `code` says why, for a translated message: artistAccount.error_<code>. */
export class ArtistAccountError extends Error {
  constructor(readonly code: "other_role" | "already_linked" | "disabled" | "not_allowed") {
    super(`Artist account: ${code}`);
    this.name = "ArtistAccountError";
  }
}

export interface ArtistAccount {
  userId: string;
  email: string;
  name: string;
  locale: "nl" | "en";
  /** The account was made just now. */
  created: boolean;
  /** No way to sign in yet: they need a first-password link. */
  needsSetup: boolean;
}

/**
 * Creates or finds the login and makes it an artist member of the agency. Sends
 * nothing: link the profile first, then call sendArtistSetup, so an email never
 * goes out for an account that didn't end up linked.
 */
export async function ensureArtistAccount(input: { organizationId: string; email: string; name: string; locale: string }, retried = false): Promise<ArtistAccount> {
  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, locale: true, disabledAt: true, platformRole: true, accounts: { where: { providerId: "credential" }, select: { id: true }, take: 1 } } });
  if (user?.disabledAt) throw new ArtistAccountError("disabled");
  if (user?.platformRole === "platform_admin") throw new ArtistAccountError("not_allowed");
  const userId = user?.id ?? randomUUID();
  const member = user ? await prisma.member.findUnique({ where: { organizationId_userId: { organizationId: input.organizationId, userId } }, select: { role: true } }) : null;
  if (member && member.role !== "artist") throw new ArtistAccountError("other_role");
  if (await prisma.artist.findFirst({ where: { organizationId: input.organizationId, userId }, select: { id: true } })) throw new ArtistAccountError("already_linked");

  try {
    await prisma.$transaction(async (tx) => {
      if (!user) await tx.user.create({ data: { id: userId, name: input.name.trim(), email, emailVerified: true, locale: userLocale(input.locale) } });
      if (!member) await tx.member.create({ data: { id: randomUUID(), organizationId: input.organizationId, userId, role: "artist" } });
    });
  } catch (error) {
    // Invited twice at once: the unique indexes let one through. Carry on from what it made.
    if ((error as { code?: string }).code === "P2002" && !retried) return ensureArtistAccount(input, true);
    throw error;
  }
  return {
    userId,
    email,
    name: user?.name ?? input.name.trim(),
    locale: userLocale(user?.locale ?? input.locale),
    created: !user,
    needsSetup: (user?.accounts.length ?? 0) === 0,
  };
}

/**
 * What became of a first-password email. None of these means it reached the inbox:
 * - "accepted": stored in the outbox, so it's sent or retried;
 * - "already_sent": it was stored before for this agency; a new one is the resend's job;
 * - "failed": it couldn't be stored. The account stays usable: resend from the artist's page.
 */
export type ArtistSetupResult = "accepted" | "already_sent" | "failed";

export async function sendArtistSetup(organizationId: string, account: Pick<ArtistAccount, "userId" | "email" | "name" | "locale">): Promise<ArtistSetupResult> {
  const key = `artist-setup:${organizationId}:${account.userId}`;
  // Checked first: every link is a live token, so don't make one for an email that won't go out.
  if ((await prisma.emailMessage.count({ where: { key } })) > 0) return "already_sent";
  const receipt = await deliver(
    { kind: "artistAccountSetup", to: account.email, params: { locale: account.locale, name: account.name, url: await passwordSetupUrl(account.userId, account.locale) } },
    { key, agencyId: organizationId },
  );
  return accepted(receipt) ? "accepted" : "failed";
}

/**
 * A new first-password link, for one that expired, got lost or never went out.
 * Once it's accepted the earlier links stop working, so only one is ever valid.
 */
export async function resendArtistSetup(organizationId: string, user: { id: string; email: string; name: string; locale: string | null }): Promise<ArtistSetupResult> {
  const locale = userLocale(user.locale);
  const url = await passwordSetupUrl(user.id, locale);
  const token = new URL(url).searchParams.get("token");
  const receipt = await deliver({ kind: "artistAccountSetup", to: user.email, params: { locale, name: user.name, url } }, { agencyId: organizationId });
  if (!accepted(receipt)) return "failed";
  await prisma.verification.deleteMany({ where: { value: user.id, identifier: { startsWith: "reset-password:", not: `reset-password:${token}` } } });
  return "accepted";
}

/**
 * Requests made before this profile had a login reach the artist now, with
 * the same email and notification as a new one. The email's outbox key stops a
 * second copy if a request was already mailed to them.
 */
export async function announceOpenRequests(artistId: string, userId: string) {
  const open = await prisma.bookingAssignment.findMany({
    where: { artistId, status: "pending", booking: { status: { in: [...artistAssignableStatuses] } } },
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
