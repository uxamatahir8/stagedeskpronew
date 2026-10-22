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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Locale } from "@/i18n/routing";
import { euro, eventDate, percent } from "@/lib/format";
import { requireAgency } from "@/lib/viewer";
import { artistDashboardAction, connectArtistAction } from "./actions";

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
  const [t, tp, format, artist] = await Promise.all([
    getTranslations("earnings"),
    getTranslations("payments"),
    getFormatter(),
    prisma.artist.findFirst({ where: { organizationId: organization.id, userId: viewer.user.id }, include: { connectedAccount: true } }),
  ]);
  if (!artist) return <EmptyState icon={HandCoinsIcon} title={t("title")} description={t("noProfile")} />;

  // The artist's own bookings at this agency; shares are a fixed percentage of the booking total.
  const [assignments, ledger] = await Promise.all([
    prisma.bookingAssignment.findMany({
      where: { artistId: artist.id, status: "accepted", booking: { status: { in: [...done, ...upcoming] } } },
      include: { booking: { select: { id: true, trackingCode: true, eventType: true, eventDate: true, status: true, totalCents: true } } },
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
  const total = (pick: (r: (typeof rows)[number]) => number, statuses?: string[]) =>
    rows.filter((r) => !statuses || statuses.includes(r.status)).reduce((sum, r) => sum + pick(r), 0);

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <ConnectCard
        stripeReady={isStripeConfigured()}
        account={artist.connectedAccount}
        body={t("connectBody")}
        connectedText={tp("connected")}
        connect={connectArtistAction}
        dashboard={artistDashboardAction}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("earned")} value={euro(format, total((r) => r.share, done))} icon={HandCoinsIcon} />
        <StatCard label={t("paidOut")} value={euro(format, total((r) => r.paidOut))} icon={WalletIcon} />
        <StatCard label={t("owed")} value={euro(format, total((r) => r.owed))} icon={HourglassIcon} />
        <StatCard label={t("upcoming")} value={euro(format, total((r) => r.share, upcoming))} icon={CalendarClockIcon} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("list")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tp("booking")}</TableHead>
                  <TableHead>{tp("date")}</TableHead>
                  <TableHead>{tp("status")}</TableHead>
                  <TableHead className="text-right">{t("share")}</TableHead>
                  <TableHead className="text-right">{t("paidOut")}</TableHead>
                  <TableHead className="text-right">{t("owed")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm">{r.trackingCode}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{eventDate(format, r.eventDate, "short") ?? "—"}</TableCell>
                    <TableCell>
                      <BookingStatusBadge status={r.status as BookingStatus} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {euro(format, r.share)}
                      <div className="text-xs text-muted-foreground">{percent(format, r.shareBps)}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.paidOut ? euro(format, r.paidOut) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.owed ? euro(format, r.owed) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
