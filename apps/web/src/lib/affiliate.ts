import "server-only";
import { forbidden } from "next/navigation";
import type { Permission } from "@stagedesk/core";
import { prisma } from "@stagedesk/db";
import { appUrl } from "./mail";
import { requirePermission } from "./viewer";

/** The signed-in affiliate and their partner record (pending ones included). */
export async function requireAffiliate(permission: Permission) {
  const viewer = await requirePermission(permission);
  const affiliate = await prisma.affiliate.findUnique({ where: { userId: viewer.user.id } });
  if (!affiliate) forbidden();
  return { viewer, affiliate };
}

/** A shareable referral link, optionally for a campaign and a specific page. */
export function referralLink(code: string, campaign?: string | null, path = "/") {
  const url = new URL(path, appUrl);
  url.searchParams.set("via", code);
  if (campaign) url.searchParams.set("c", campaign);
  return url.toString();
}
