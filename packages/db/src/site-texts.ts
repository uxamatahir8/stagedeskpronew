import { prisma } from "./client";

/**
 * Texts changed in the admin panel. The web app merges them over its
 * translation files; a key without a row shows the file's text.
 */
export async function siteTextOverrides(locale: "nl" | "en") {
  const rows = await prisma.siteText.findMany({ where: { locale }, select: { key: true, value: true } });
  return Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, string>;
}

export async function listSiteTexts() {
  return prisma.siteText.findMany({ orderBy: { key: "asc" } });
}

export async function saveSiteText(locale: "nl" | "en", key: string, value: string, userId: string) {
  return prisma.siteText.upsert({
    where: { locale_key: { locale, key } },
    create: { locale, key, value, updatedBy: userId },
    update: { value, updatedBy: userId },
  });
}

/** Back to the text in the translation file. */
export async function resetSiteText(locale: "nl" | "en", key: string) {
  await prisma.siteText.deleteMany({ where: { locale, key } });
}
