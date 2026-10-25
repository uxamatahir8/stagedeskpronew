import "server-only";
import { cache } from "react";
import { type DatePrefs, resolveDatePrefs } from "@stagedesk/core";
import { prisma } from "@stagedesk/db";
import { siteSettings } from "./site";
import { getViewer } from "./viewer";

const fields = { timeZone: true, dateFormat: true, timeFormat: true } as const;

/** The platform's defaults (Settings → General); cached with the other site settings. */
export async function platformDatePrefs(): Promise<DatePrefs> {
  const { site } = await siteSettings();
  return resolveDatePrefs(site);
}

/** The signed-in person's own choice, else their agency's, else the platform's. */
export const viewerDatePrefs = cache(async (): Promise<DatePrefs> => {
  const [viewer, platform] = await Promise.all([getViewer(), platformDatePrefs()]);
  if (!viewer) return platform;
  const [user, organization] = await Promise.all([
    prisma.user.findUnique({ where: { id: viewer.user.id }, select: fields }),
    viewer.organization ? prisma.organization.findUnique({ where: { id: viewer.organization.id }, select: fields }) : null,
  ]);
  return resolveDatePrefs(user, organization, platform);
});
