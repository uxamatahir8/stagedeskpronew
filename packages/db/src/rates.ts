import type { Currency, RateTable } from "@stagedesk/core";
import { prisma } from "./client";

/** The latest ECB rates: one euro in each currency, and the date they were published. */
export async function exchangeRates(): Promise<{ rates: RateTable; date: Date | null }> {
  const rows = await prisma.exchangeRate.findMany();
  const rates: RateTable = {};
  let date: Date | null = null;
  for (const r of rows) {
    rates[r.currency as Currency] = Number(r.perEur);
    if (!date || r.rateDate > date) date = r.rateDate;
  }
  return { rates, date };
}

export async function saveExchangeRates(date: string, rates: RateTable) {
  const rateDate = new Date(`${date}T00:00:00Z`);
  await prisma.$transaction(
    Object.entries(rates).map(([currency, perEur]) =>
      prisma.exchangeRate.upsert({ where: { currency }, create: { currency, perEur: String(perEur), rateDate }, update: { perEur: String(perEur), rateDate } }),
    ),
  );
}
