import { type Currency, mergeRates, type RateTable } from "@stagedesk/core";
import { prisma } from "./client";
import { getSetting } from "./settings";

/**
 * One euro in each currency: the latest ECB rates with the admin's manual
 * rates on top, and the date the ECB published them.
 */
export async function exchangeRates(): Promise<{ rates: RateTable; date: Date | null }> {
  const [rows, { manualRates }] = await Promise.all([prisma.exchangeRate.findMany(), getSetting("currencies")]);
  const rates: RateTable = {};
  let date: Date | null = null;
  for (const r of rows) {
    rates[r.currency as Currency] = Number(r.perEur);
    if (!date || r.rateDate > date) date = r.rateDate;
  }
  return { rates: mergeRates(rates, manualRates), date };
}

/** The ECB rates alone, for the admin's currency table. */
export async function ecbRates() {
  return prisma.exchangeRate.findMany({ orderBy: { currency: "asc" } });
}

/** Currencies agencies and visitors may choose (Settings → Currencies). */
export async function enabledCurrencies(): Promise<Currency[]> {
  return (await getSetting("currencies")).enabled;
}

export async function saveExchangeRates(date: string, rates: RateTable) {
  const rateDate = new Date(`${date}T00:00:00Z`);
  await prisma.$transaction(
    Object.entries(rates).map(([currency, perEur]) =>
      prisma.exchangeRate.upsert({ where: { currency }, create: { currency, perEur: String(perEur), rateDate }, update: { perEur: String(perEur), rateDate } }),
    ),
  );
}
