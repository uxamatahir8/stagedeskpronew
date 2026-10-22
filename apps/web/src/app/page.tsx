import { Suspense } from "react";
import { connection } from "next/server";
import { formatMoney, splitBookingPayment } from "@stagedesk/core";
import { getSetting } from "@stagedesk/db";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16">
      <p className="text-sm font-semibold uppercase tracking-wider text-brand">StageDesk v2</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight">Development build</h1>
      <p className="mt-3 text-muted">
        The marketing site, booking pages and dashboard are built in the phases of the rebuild plan.
        This page checks that the app, the shared packages and the database are wired together.
      </p>
      <Suspense fallback={<p className="mt-8 text-muted">Checking the database…</p>}>
        <SystemStatus />
      </Suspense>
    </main>
  );
}

async function SystemStatus() {
  await connection();
  const [site, fees] = await Promise.all([getSetting("site.general"), getSetting("fees.platform")]);
  const example = splitBookingPayment({
    amount: 150_000,
    stripeFee: 0,
    artistShareBps: 4_000,
    feeRule: fees.defaultRule,
    stripeFeePaidBy: fees.stripeFeePaidBy,
  });

  const rows: [string, string][] = [
    ["Site name (from settings)", site.siteName],
    ["Default language", site.defaultLocale.toUpperCase()],
    ["Platform fee", `${fees.defaultRule.percentageBps / 100}% · ${fees.defaultRule.type}`],
    ["€1,500 booking → artist (40%)", formatMoney(example.artist)],
    ["€1,500 booking → agency", formatMoney(example.agency)],
    ["€1,500 booking → platform", formatMoney(example.platform)],
  ];

  return (
    <dl className="mt-8 divide-y divide-line border-y border-line">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 py-3">
          <dt className="text-muted">{label}</dt>
          <dd className="font-mono tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
