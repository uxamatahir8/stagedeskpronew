"use server";

import { randomUUID } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import {
  addAgencyDomain,
  audit,
  createSitePage,
  deleteSitePage,
  publishSite,
  recordDomainCheck,
  removeAgencyDomain,
  reorderSitePages,
  saveSitePageDraft,
  saveSiteTheme,
  setSiteLive,
  SiteError,
  tenantDb,
  updateSitePageSettings,
} from "@stagedesk/db";
import type { ActionResult } from "@/lib/actions";
import { featureBlocked, writeBlocked } from "@/lib/billing";
import { clientIp } from "@/lib/rate-limit";
import { detectImage, putPublicFile } from "@/lib/storage";
import { requireAgency } from "@/lib/viewer";

async function siteError(error: unknown): Promise<ActionResult> {
  const t = await getTranslations("websiteEditor");
  if (error instanceof SiteError) return { ok: false, message: t(`error_${error.code}`) };
  throw error;
}

function done() {
  revalidatePath("/[locale]/app/website", "page");
  revalidatePath("/[locale]/app/website/domain", "page");
}

/** Editing needs the settings permission and an agency that can still make changes. */
async function editor() {
  const ctx = await requireAgency("agency.settings");
  const blocked = await writeBlocked(ctx.organization.id);
  return { ...ctx, blocked };
}

/** Autosave of one page's draft. The live site doesn't change until publish. */
export async function saveDraftAction(pageId: string, content: unknown): Promise<ActionResult> {
  const { organization, blocked } = await editor();
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("websiteEditor");
  try {
    await saveSitePageDraft(organization.id, pageId, content);
    return { ok: true, message: t("saved") };
  } catch (error) {
    return siteError(error);
  }
}

export type CreatePageResult = { ok: true; id: string; message: string } | { ok: false; message: string };

export async function createPageAction(input: { slug: string; title: string }): Promise<CreatePageResult> {
  const { organization, blocked } = await editor();
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("websiteEditor");
  try {
    const id = await createSitePage(organization.id, input);
    done();
    return { ok: true, id, message: t("pageCreated") };
  } catch (error) {
    return siteError(error) as Promise<CreatePageResult>;
  }
}

export async function updatePageSettingsAction(pageId: string, input: { slug?: string; inNav?: boolean }): Promise<ActionResult> {
  const { organization } = await editor();
  const t = await getTranslations("websiteEditor");
  try {
    await updateSitePageSettings(organization.id, pageId, input);
    done();
    return { ok: true, message: t("pageSaved") };
  } catch (error) {
    return siteError(error);
  }
}

export async function deletePageAction(pageId: string): Promise<ActionResult> {
  const { organization } = await editor();
  const t = await getTranslations("websiteEditor");
  try {
    await deleteSitePage(organization.id, pageId);
    done();
    return { ok: true, message: t("pageDeleted") };
  } catch (error) {
    return siteError(error);
  }
}

export async function reorderPagesAction(pageIds: string[]): Promise<ActionResult> {
  const { organization } = await editor();
  await reorderSitePages(organization.id, pageIds.slice(0, 50));
  done();
  return { ok: true, message: (await getTranslations("websiteEditor"))("pageSaved") };
}

export async function saveThemeAction(input: { theme: unknown; englishEnabled: boolean }): Promise<ActionResult> {
  const { organization, blocked } = await editor();
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("websiteEditor");
  try {
    await saveSiteTheme(organization.id, input);
    return { ok: true, message: t("saved") };
  } catch (error) {
    return siteError(error);
  }
}

/** Makes all drafts live. */
export async function publishAction(): Promise<ActionResult> {
  const { viewer, organization, blocked } = await editor();
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("websiteEditor");
  await publishSite(organization.id);
  await audit({ actorId: viewer.user.id, action: "site.publish", agencyId: organization.id, ip: clientIp(await headers()) });
  done();
  return { ok: true, message: t("publishedToast") };
}

export async function setLiveAction(live: boolean): Promise<ActionResult> {
  const { viewer, organization } = await editor();
  const t = await getTranslations("websiteEditor");
  try {
    await setSiteLive(organization.id, live);
    await audit({ actorId: viewer.user.id, action: live ? "site.online" : "site.offline", agencyId: organization.id, ip: clientIp(await headers()) });
    done();
    return { ok: true, message: t(live ? "wentOnline" : "wentOffline") };
  } catch (error) {
    return siteError(error);
  }
}

export type UploadResult = { ok: true; url: string } | { ok: false; message: string };
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** An image for a hero or gallery, stored like other public files. */
export async function uploadSiteImageAction(form: FormData): Promise<UploadResult> {
  const { organization, blocked } = await editor();
  if (blocked) return { ok: false, message: blocked };
  const t = await getTranslations("websiteEditor");
  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_IMAGE_BYTES) return { ok: false, message: t("invalidImage") };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const image = detectImage(bytes);
  if (!image) return { ok: false, message: t("invalidImage") };
  const url = await putPublicFile(`organizations/${organization.id}/site/${randomUUID()}.${image.ext}`, bytes, image.mime);
  return { ok: true, url };
}

/** Custom domains are a plan feature; up to three per agency. */
export async function addDomainAction(hostname: string): Promise<ActionResult> {
  const { viewer, organization } = await editor();
  const t = await getTranslations("websiteEditor");
  const blocked = await featureBlocked(organization.id, "customDomain");
  if (blocked) return { ok: false, message: blocked };
  try {
    const domain = await addAgencyDomain(organization.id, hostname);
    await audit({ actorId: viewer.user.id, action: "site.domain_add", agencyId: organization.id, data: { hostname: domain.hostname }, ip: clientIp(await headers()) });
    done();
    return { ok: true, message: t("domainAdded") };
  } catch (error) {
    return siteError(error);
  }
}

/**
 * Looks up the TXT record _stagedesk.<domain>. Outside production, names
 * under .localhost are accepted without DNS so the flow can be tried locally.
 */
export async function verifyDomainAction(domainId: string): Promise<ActionResult> {
  const { organization } = await editor();
  const t = await getTranslations("websiteEditor");
  const domain = await tenantDb(organization.id).agencyDomain.findFirst({ where: { id: domainId } });
  if (!domain) return { ok: false, message: t("error_not_found") };
  let result: { ok: true } | { ok: false; error: string };
  if (process.env.NODE_ENV !== "production" && domain.hostname.endsWith(".localhost")) {
    result = { ok: true };
  } else {
    try {
      const records = (await resolveTxt(`_stagedesk.${domain.hostname}`)).map((r) => r.join(""));
      result = records.includes(domain.token) ? { ok: true } : { ok: false, error: t("txtMismatch") };
    } catch {
      result = { ok: false, error: t("txtMissing") };
    }
  }
  const checked = await recordDomainCheck(organization.id, domainId, result);
  done();
  return checked.status === "verified" ? { ok: true, message: t("domainVerified") } : { ok: false, message: checked.lastError ?? t("txtMissing") };
}

export async function removeDomainAction(domainId: string): Promise<ActionResult> {
  const { viewer, organization } = await editor();
  const t = await getTranslations("websiteEditor");
  await removeAgencyDomain(organization.id, domainId);
  await audit({ actorId: viewer.user.id, action: "site.domain_remove", agencyId: organization.id, ip: clientIp(await headers()) });
  done();
  return { ok: true, message: t("domainRemoved") };
}
