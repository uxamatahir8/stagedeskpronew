import "server-only";

import { randomUUID } from "node:crypto";
import { prisma } from "@stagedesk/db";
import { deliver, userLocale } from "./mail";
import { passwordSetupUrl } from "./password-setup";

export class ArtistAccountError extends Error {}

/** Create or link the artist login immediately and email a one-time password setup link for new passwordless users. */
export async function ensureArtistAccount(input: { organizationId: string; email: string; name: string; locale: string }) {
  const email = input.email.trim().toLowerCase();
  let user = await prisma.user.findUnique({ where: { email }, select: { id: true, name: true, locale: true, accounts: { where: { providerId: "credential" }, select: { id: true }, take: 1 } } });
  const userId = user?.id ?? randomUUID();
  const member = user ? await prisma.member.findUnique({ where: { organizationId_userId: { organizationId: input.organizationId, userId } }, select: { role: true } }) : null;
  if (member && member.role !== "artist") throw new ArtistAccountError("This email already belongs to another team role in this agency.");
  if (await prisma.artist.findFirst({ where: { organizationId: input.organizationId, userId }, select: { id: true } })) throw new ArtistAccountError("This account is already linked to an artist in this agency.");

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
