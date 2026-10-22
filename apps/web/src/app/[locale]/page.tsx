import { Suspense } from "react";
import { connection } from "next/server";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRightIcon } from "lucide-react";
import { splitBookingPayment } from "@stagedesk/core";
import { getSetting } from "@stagedesk/db";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

// Temporary start page until the marketing site is built in phase 8.
export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale as "nl" | "en");
  const t = await getTranslations("status");

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16">
      <p className="text-sm font-semibold tracking-wider text-primary uppercase">{t("eyebrow")}</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight">{t("title")}</h1>
      <p className="mt-3 text-muted-foreground">{t("intro")}</p>
      <Button asChild className="mt-6">
        <Link href="/app">
          {t("openDashboard")}
          <ArrowRightIcon />
        </Link>
      </Button>
      <Suspense fallback={<p className="mt-8 text-muted-foreground">{t("checking")}</p>}>
        <SystemStatus />
      </Suspense>
    </main>
  );
}

async function SystemStatus() {
  await connection();
  const [t, format, site, fees] = await Promise.all([
    getTranslations("status"),
    getFormatter(),
    getSetting("site.general"),
    getSetting("fees.platform"),
  ]);
  const example = splitBookingPayment({
    amount: 150_000,
    stripeFee: 0,
    artistShareBps: 4_000,
    feeRule: fees.defaultRule,
    stripeFeePaidBy: fees.stripeFeePaidBy,
  });
  const euro = (cents: number) => format.number(cents / 100, { style: "currency", currency: "EUR" });

  const rows: [string, string][] = [
    [t("siteName"), site.siteName],
    [t("defaultLanguage"), site.defaultLocale.toUpperCase()],
    [t("platformFee"), format.number(fees.defaultRule.percentageBps / 10_000, { style: "percent" })],
    [t("toArtist"), euro(example.artist)],
    [t("toAgency"), euro(example.agency)],
    [t("toPlatform"), euro(example.platform)],
  ];

  return (
    <dl className="mt-10 divide-y border-y">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 py-3">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-mono tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
