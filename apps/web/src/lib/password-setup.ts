import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { prisma } from "@stagedesk/db";
import { absoluteUrl } from "./mail";

/** How long a first-time password link works (the emails say 24 hours). */
const SETUP_HOURS = 24;

/**
 * A one-time link for someone whose account was created for them to choose a
 * first password. It is a Better Auth reset token (`reset-password:<token>`),
 * so `/reset-password` and `authClient.resetPassword` consume it once and
 * create the credential account; `setup=1` only changes the page's wording.
 */
export async function passwordSetupUrl(userId: string, locale: string) {
  const token = randomBytes(32).toString("hex");
  await prisma.verification.create({
    data: { id: randomUUID(), identifier: `reset-password:${token}`, value: userId, expiresAt: new Date(Date.now() + SETUP_HOURS * 60 * 60 * 1000) },
  });
  return absoluteUrl(locale, `/reset-password?token=${token}&setup=1`);
}

/** Whether the account can sign in with a password already (accounts created for someone can't yet). */
export async function hasPassword(userId: string) {
  return (await prisma.account.count({ where: { userId, providerId: "credential" } })) > 0;
}

/** Whether a reset or setup token can still be used, so the page can say so before a password is typed. */
export async function resetTokenUsable(token: string) {
  if (!/^[\w-]{16,128}$/.test(token)) return false;
  const row = await prisma.verification.findFirst({ where: { identifier: `reset-password:${token}`, expiresAt: { gt: new Date() } }, select: { id: true } });
  return row !== null;
}
