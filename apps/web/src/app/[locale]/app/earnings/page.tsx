import { CalendarClockIcon, HandCoinsIcon, HourglassIcon, WalletIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { type BookingStatus, percentOf } from "@stagedesk/core";
import { prisma } from "@stagedesk/db";
import { isStripeConfigured } from "@stagedesk/payments";
import { ConnectCard } from "@/components/connect-card";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { BookingStatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/list/data-table";
import type { Locale } from "@/i18n/routing";
import { euro, eventDate, percent } from "@/lib/format";
import { requireAgency } from "@/lib/viewer";
import { artistDashboardAction, connectArtistAction } from "./actions";
import { refreshIncompleteAccount } from "@/lib/connect";

const spec = { sorts: ["date", "booking", "status", "share", "paidOut", "owed"], defaultSort: "date", defaultDir: "desc" as const, filters: { status: ["booked", "confirmed", "completed", "settled", "cancelled"], payout: ["paid", "owed", "open"] } };

export async function generateMetadata({ params }: PageProps<"/[locale]/app/earnings">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "earnings" });
  return { title: t("title") };
}

export default async function EarningsPage({ params }: PageProps<"/[locale]/app/earnings">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
      <Earnings />
    </Suspense>
  );
}

const done = ["completed", "settled"];
const upcoming = ["booked", "confirmed"];

async function Earnings() {
  const { viewer, organization } = await requireAgency("artist.earnings");
  const [t, tp, tbs, format, artist] = await Promise.all([
    getTranslations("earnings"),
    getTranslations("payments"),
    getTranslations("bookingStatus"),
    getFormatter(),
    prisma.artist.findFirst({ where: { organizationId: organization.id, userId: viewer.user.id }, include: { connectedAccount: true } }),
  ]);
  if (!artist) return <EmptyState icon={HandCoinsIcon} title={t("title")} description={t("noProfile")} />;
  if (await refreshIncompleteAccount(artist.connectedAccount)) {
    artist.connectedAccount = await prisma.connectedAccount.findUnique({ where: { id: artist.connectedAccount!.id } });
  }

  // The artist's own bookings at this agency; shares are a fixed percentage of the booking total.
  const [assignments, ledger] = await Promise.all([
    prisma.bookingAssignment.findMany({
      where: { artistId: artist.id, status: "accepted", booking: { status: { in: [...done, ...upcoming] } } },
      include: { booking: { select: { id: true, trackingCode: true, currency: true, eventType: true, eventDate: true, status: true, totalCents: true } } },
      orderBy: { booking: { eventDate: "desc" } },
    }),
    prisma.ledgerEntry.findMany({
      where: { artistId: artist.id, type: { in: ["transfer", "transfer_reversal", "owed_by_agency"] } },
      select: { bookingId: true, type: true, amountCents: true },
    }),
  ]);
  const ledgerFor = (bookingId: string, types: string[]) =>
    ledger.filter((l) => l.bookingId === bookingId && types.includes(l.type)).reduce((sum, l) => sum + l.amountCents, 0);
  const rows = assignments.map((a) => ({
    ...a.booking,
    shareBps: a.shareBps,
    share: percentOf(a.booking.totalCents, a.shareBps),
    paidOut: ledgerFor(a.booking.id, ["transfer", "transfer_reversal"]),
    owed: ledgerFor(a.booking.id, ["owed_by_agency"]),
  }));
  // Totals are in the currency most gigs are in; an artist working across currencies sees each gig in its own below.
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.currency, (counts.get(r.currency) ?? 0) + 1);
  const currency = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "EUR";
  const total = (pick: (r: (typeof rows)[number]) => number, statuses?: string[]) =>
    rows.filter((r) => r.currency === currency && (!statuses || statuses.includes(r.status))).reduce((sum, r) => sum + pick(r), 0);

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <ConnectCard
        stripeReady={await isStripeConfigured()}
        account={artist.connectedAccount}
        body={t("connectBody")}
        connectedText={tp("connected")}
        connect={connectArtistAction}
        dashboard={artistDashboardAction}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} label={t("earned")} value={euro(format, total((r) => r.share, done), currency)} icon={HandCoinsIcon} />
        <StatCard index={1} label={t("paidOut")} value={euro(format, total((r) => r.paidOut), currency)} icon={WalletIcon} />
        <StatCard index={2} label={t("owed")} value={euro(format, total((r) => r.owed), currency)} icon={HourglassIcon} />
        <StatCard index={3} label={t("upcoming")} value={euro(format, total((r) => r.share, upcoming), currency)} icon={CalendarClockIcon} />
      </div>

      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">{t("list")}</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <DataTable
            spec={spec}
            placeholder={t("searchPlaceholder")}
            filters={[
              { key: "status", label: tp("status"), options: [...new Set(rows.map((r) => r.status))].map((st) => ({ value: st, label: tbs(st as BookingStatus) })) },
              { key: "payout", label: t("paidOut"), options: [{ value: "paid", label: t("filterPaid") }, { value: "owed", label: t("filterOwed") }, { value: "open", label: t("filterOpen") }] },
            ]}
            columns={[
              { label: tp("booking"), sort: "booking" },
              { label: tp("date"), sort: "date" },
              { label: tp("status"), sort: "status" },
              { label: t("share"), sort: "share", align: "right" },
              { label: t("paidOut"), sort: "paidOut", align: "right" },
              { label: t("owed"), sort: "owed", align: "right" },
            ]}
            rows={rows.map((r) => ({
              id: r.id,
              text: r.trackingCode,
              values: { booking: r.trackingCode, date: r.eventDate?.getTime() ?? null, status: tbs(r.status as BookingStatus), share: r.share, paidOut: r.paidOut, owed: r.owed },
              facets: { status: r.status, payout: r.owed ? "owed" : r.paidOut ? "paid" : "open" },
              cells: [
                <span key="c" className="font-mono text-sm">{r.trackingCode}</span>,
                eventDate(format, r.eventDate, "short") ?? "—",
                <BookingStatusBadge key="s" status={r.status as BookingStatus} />,
                <div key="sh">
                  {euro(format, r.share, r.currency)}
                  <div className="text-xs text-muted-foreground">{percent(format, r.shareBps)}</div>
                </div>,
                r.paidOut ? euro(format, r.paidOut, r.currency) : "—",
                r.owed ? euro(format, r.owed, r.currency) : "—",
              ],
            }))}
          />
        )}
      </section>
    </div>
  );
}
