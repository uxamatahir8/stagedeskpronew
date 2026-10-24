"use server";

import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { acceptLegal, pendingLegal } from "@stagedesk/db";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { homeHref } from "@/lib/billing";
import { clientIp } from "@/lib/rate-limit";
import { getViewer } from "@/lib/viewer";

/**
 * Records acceptance of exactly the versions that were shown, so a version
 * published in the meantime is asked for separately.
 */
export async function acceptTermsAction(versionIds: string[]) {
  const viewer = await getViewer();
  const locale = (await getLocale()) as Locale;
  if (!viewer) redirect({ href: "/sign-in", locale });
  const pending = new Set((await pendingLegal(viewer!.user.id)).map((p) => p.publishedVersionId));
  const ids = versionIds.filter((id) => pending.has(id));
  if (ids.length) await acceptLegal(viewer!.user.id, ids, clientIp(await headers()));
  // A new agency without a plan continues where onboarding sent it: choosing one.
  redirect({ href: await homeHref(viewer!), locale });
}
