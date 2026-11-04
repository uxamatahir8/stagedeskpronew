import { ClipboardListIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import { type EventType } from "@stagedesk/core";
import { artistGigs } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { GigStateBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { eventDate } from "@/lib/format";
import { requirePermission } from "@/lib/viewer";
import { CardList } from "@/components/list/data-table";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/gigs">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "gigs" });
  return { title: t("title") };
}

export default async function GigsPage({ params }: PageProps<"/[locale]/app/gigs">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Gigs />
    </Suspense>
  );
}

const spec = { sorts: ["date"], defaultSort: "date", defaultDir: "asc" as const, filters: { when: ["upcoming", "past"], agency: [] as string[], type: ["wedding", "corporate", "birthday", "party", "festival", "other"] } };

async function Gigs() {
  const viewer = await requirePermission("artist.gigs");
  const [t, te, format, { requests, upcoming, past, closed }] = await Promise.all([
    getTranslations("gigs"),
    getTranslations("eventTypes"),
    getFormatter(),
    artistGigs(viewer.user.id),
  ]);

  const card = (a: (typeof requests)[number]) => (
    <Link href={`/app/gigs/${a.booking.trackingCode}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 hover:bg-accent/40">
      <div className="grid gap-0.5">
        <span className="font-medium">
          {te(a.booking.eventType as EventType)}
          {a.booking.venueCity && ` · ${a.booking.venueCity}`}
        </span>
        <span className="text-sm text-muted-foreground">
          {eventDate(format, a.booking.eventDate) ?? t("dateNotScheduled")}
          {a.booking.startTime && ` · ${a.booking.startTime}${a.booking.endTime ? `–${a.booking.endTime}` : ""}`}
          {` · ${a.booking.organization.name}`}
        </span>
      </div>
      <GigStateBadge state={a.state} />
    </Link>
  );
  const accepted = [...upcoming, ...past];
  const isUpcoming = new Set(upcoming.map((g) => g.id));

  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      {requests.length + accepted.length + closed.length === 0 ? (
        <EmptyState icon={ClipboardListIcon} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <>
          {requests.length > 0 && (
            <section className="grid gap-3" data-testid="gig-requests">
              <h2 className="font-semibold">{t("requestsCount", { count: requests.length })}</h2>
              <ul className="grid gap-3">
                {requests.map((a) => (
                  <li key={a.id}>{card(a)}</li>
                ))}
              </ul>
            </section>
          )}
          {accepted.length > 0 && (
            <section className="grid gap-3">
              <h2 className="font-semibold">{t("myGigs")}</h2>
              <CardList
                spec={{ ...spec, filters: { ...spec.filters, agency: [...new Set(accepted.map((g) => g.booking.organization.name))] } }}
                placeholder={t("searchPlaceholder")}
                className="grid gap-3"
                sorts={[{ key: "date", label: t("sortDate") }]}
                filters={[
                  { key: "when", label: t("when"), options: [{ value: "upcoming", label: t("upcoming") }, { value: "past", label: t("past") }] },
                  { key: "agency", label: t("agency"), options: [...new Set(accepted.map((g) => g.booking.organization.name))].map((n) => ({ value: n, label: n })) },
                  { key: "type", label: t("eventType"), options: [...new Set(accepted.map((g) => g.booking.eventType))].map((e) => ({ value: e, label: te(e as EventType) })) },
                ]}
                items={accepted.map((g) => ({
                  id: g.id,
                  text: `${te(g.booking.eventType as EventType)} ${g.booking.venueName ?? ""} ${g.booking.venueCity ?? ""} ${g.booking.organization.name} ${g.booking.trackingCode}`,
                  values: { date: g.booking.eventDate?.getTime() ?? null },
                  facets: { when: isUpcoming.has(g.id) ? "upcoming" : "past", agency: g.booking.organization.name, type: g.booking.eventType },
                  node: card(g),
                }))}
              />
            </section>
          )}
          {closed.length > 0 && (
            <section className="grid gap-3">
              <h2 className="font-semibold">{t("closedTitle")}</h2>
              <ul className="grid gap-2">
                {closed.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-sm text-muted-foreground">
                    <span>
                      {te(a.booking.eventType as EventType)} · {eventDate(format, a.booking.eventDate, "short") ?? t("dateNotScheduled")} · {a.booking.organization.name}
                    </span>
                    <GigStateBadge state={a.state} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
