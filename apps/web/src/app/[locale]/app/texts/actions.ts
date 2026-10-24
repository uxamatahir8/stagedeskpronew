"use server";

import { revalidatePath, updateTag } from "next/cache";
import { getTranslations } from "next-intl/server";
import { audit, resetSiteText, saveSiteText } from "@stagedesk/db";
import type { ActionResult } from "@/lib/actions";
import { checkText, flatten, TEXTS_TAG } from "@/lib/site-texts";
import { requirePermission } from "@/lib/viewer";
import en from "../../../../../messages/en.json";
import nl from "../../../../../messages/nl.json";

const files = { nl: flatten(nl), en: flatten(en) };

function refresh() {
  updateTag(TEXTS_TAG);
  revalidatePath("/", "layout");
}

/** Saves a changed text; the same text as the file removes the change. */
export async function saveTextAction(key: string, locale: "nl" | "en", value: string): Promise<ActionResult> {
  const viewer = await requirePermission("platform.pages");
  const t = await getTranslations("siteTexts");
  const original = files[locale]?.[key];
  if (original === undefined) return { ok: false, message: t("unknownKey") };
  const text = value.replace(/\r\n/g, "\n");
  if (!text.trim()) return { ok: false, message: t("empty") };
  if (text.length > 5000) return { ok: false, message: t("tooLong") };
  if (text === original) {
    await resetSiteText(locale, key);
  } else {
    const check = checkText(original, text);
    if (!check.ok) return { ok: false, message: check.problem === "syntax" ? t("syntax") : t("unknownNames", { names: check.names?.join(" ") ?? "" }) };
    await saveSiteText(locale, key, text, viewer.user.id);
  }
  await audit({ actorId: viewer.user.id, action: "site_text.save", targetType: "site_text", targetId: `${locale}:${key}` });
  refresh();
  return { ok: true, message: t("saved") };
}

export async function resetTextAction(key: string, locale: "nl" | "en"): Promise<ActionResult> {
  const viewer = await requirePermission("platform.pages");
  await resetSiteText(locale, key);
  await audit({ actorId: viewer.user.id, action: "site_text.reset", targetType: "site_text", targetId: `${locale}:${key}` });
  refresh();
  return { ok: true, message: (await getTranslations("siteTexts"))("resetDone") };
}
