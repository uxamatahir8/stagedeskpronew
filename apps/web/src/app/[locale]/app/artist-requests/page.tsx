import { ArrowDownLeftIcon, ArrowUpRightIcon, UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { EventType } from "@stagedesk/core";
import { artistRequestsFor } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { eventDate, euro } from "@/lib/format";
import { getFormatter } from "@/lib/formatter";
import { requireAgency } from "@/lib/viewer";
import { RequestActions } from "./request-actions";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/artist-requests">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "artistRequests" });
  return { title: t("title") };
}

export default async function ArtistRequestsPage({ params }: PageProps<"/[locale]/app/artist-requests">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Requests />
    </Suspense>
  );
}

const tone = { yourTurn: "warning", theirTurn: "info", accepted: "success", declined: "danger", withdrawn: "neutral", cancelled: "neutral" } as const;

async function Requests() {
  const { organization } = await requireAgency("agency.bookings");
  const [t, te, format, rows] = await Promise.all([getTranslations("artistRequests"), getTranslations("eventTypes"), getFormatter(), artistRequestsFor(organization.id)]);
  const incoming = rows.filter((r) => r.side === "lender");
  const outgoing = rows.filter((r) => r.side === "borrower");

  const list = (items: typeof rows, kind: "incoming" | "outgoing") =>
    items.length === 0 ? (
      <p className="py-6 text-center text-sm text-muted-foreground">{t(kind === "incoming" ? "noIncoming" : "noOutgoing")}</p>
    ) : (
      <ul className="divide-y">
        {items.map((r) => {
          const state = r.status === "pending" ? (r.myTurn ? "yourTurn" : "theirTurn") : (r.status as keyof typeof tone);
          const other = r.side === "lender" ? r.borrower : r.lender;
          return (
            <li key={r.id} className="grid gap-3 py-4">
              <div className="grid gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.artist.stageName}</span>
                  <Pill tone={tone[state]}>{t(`status_${state}`)}</Pill>
                  <span className="text-lg font-semibold tabular-nums">{euro(format, r.feeCents, r.currency)}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t(r.side === "lender" ? "askedBy" : "askedOf", { agency: other.name })} · {te(r.booking.eventType as EventType)} · {eventDate(format, r.booking.eventDate, "short") ?? "—"}
                  {r.booking.startTime ? ` ${r.booking.startTime}` : ""} · {[r.booking.venueName, r.booking.venueCity].filter(Boolean).join(", ") || "—"}
                  {r.booking.guestCount ? ` · ${t("guests", { count: r.booking.guestCount })}` : ""}
                </p>
                {r.message && <p className="text-sm whitespace-pre-line">“{r.message}”</p>}
                {r.booking.trackingCode && (
                  <Link href={`/app/bookings/${r.booking.trackingCode}`} className="w-fit font-mono text-xs text-muted-foreground underline-offset-4 hover:underline">
                    {r.booking.trackingCode}
                  </Link>
                )}
              </div>
              {r.status === "pending" && <RequestActions requestId={r.id} myTurn={r.myTurn} currency={r.currency} />}
            </li>
          );
        })}
      </ul>
    );

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      {rows.length === 0 ? (
        <EmptyState icon={UsersIcon} title={t("empty")} description={t("emptyHint")} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowDownLeftIcon className="size-4 text-muted-foreground" aria-hidden />
                {t("incoming")}
              </CardTitle>
              <CardDescription>{t("incomingHint")}</CardDescription>
            </CardHeader>
            <CardContent>{list(incoming, "incoming")}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowUpRightIcon className="size-4 text-muted-foreground" aria-hidden />
                {t("outgoing")}
              </CardTitle>
              <CardDescription>{t("outgoingHint")}</CardDescription>
            </CardHeader>
            <CardContent>{list(outgoing, "outgoing")}</CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
