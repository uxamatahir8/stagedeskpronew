import { type SettingKey, type SettingValue, parseSetting, validateSetting } from "@stagedesk/core";
import { prisma } from "./client";

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const row = await prisma.platformSetting.findUnique({ where: { key } });
  return parseSetting(key, row?.value);
}

/** Validates, saves and records the change in one transaction. */
export async function updateSetting<K extends SettingKey>(
  key: K,
  value: unknown,
  changedById: string | null,
): Promise<SettingValue<K>> {
  const next = validateSetting(key, value);

  await prisma.$transaction(async (tx) => {
    const current = await tx.platformSetting.findUnique({ where: { key } });
    await tx.platformSetting.upsert({
      where: { key },
      create: { key, value: next, updatedById: changedById },
      update: { value: next, updatedById: changedById },
    });
    await tx.settingChange.create({
      data: { key, oldValue: current?.value ?? undefined, newValue: next, changedById },
    });
  });

  return next;
}
