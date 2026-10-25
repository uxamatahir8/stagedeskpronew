import { CalendarCheckIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import { type BookingStatus, bookingStatuses, type EventType, eventTypes, listHref, pageWindow, parseListQuery } from "@stagedesk/core";
import type { Prisma } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { ExportButton } from "@/components/export-button";
import { PageHeader } from "@/components/page-header";
import { BookingStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { ServerTable } from "@/components/list/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { euro, eventDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requireAgency } from "@/lib/viewer";
import { IfCan } from "@/components/if-can";

const tabs = {
  all: null,
  open: ["inquiry", "quoted", "expired"],
  upcoming: ["booked", "confirmed"],
  done: ["completed", "settled"],
  closed: ["declined", "cancelled"],
} as const satisfies Record<string, readonly BookingStatus[] | null>;
type Tab = keyof typeof tabs;
const tabLabels = { all: "tabAll", open: "tabOpen", upcoming: "tabUpcoming", done: "tabDone", closed: "tabClosed" } as const;

export async function generateMetadata({ params }: PageProps<"/[locale]/app/bookings">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "bookings" });
  return { title: t("title") };
}

export default async function BookingsPage({ params, searchParams }: PageProps<"/[locale]/app/bookings">) {
  setRequestLocale((await params).locale as Locale);
  const t = await getTranslations("bookings");
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <div className="flex flex-wrap gap-2">
            <IfCan permission="agency.reports">
              <ExportButton kind="bookings" />
            </IfCan>
            <IfCan permission="agency.bookings.create">
              <Button asChild>
                <Link href="/app/bookings/new">
                  <PlusIcon />
                  {t("new")}
                </Link>
              </Button>
            </IfCan>
          </div>
        }
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <BookingList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const spec = {
  sorts: ["date", "created", "customer", "status", "total"],
  // Newest first, so a fresh inquiry without a date is never buried at the end.
  defaultSort: "created",
  defaultDir: "desc" as const,
  filters: { tab: ["open", "upcoming", "done", "closed"], status: [...bookingStatuses], type: [...eventTypes], paid: ["unpaid", "partly", "paid"] },
};

async function BookingList({ searchParams }: Pick<PageProps<"/[locale]/app/bookings">, "searchParams">) {
  const { db } = await requireAgency("agency.bookings");
  const query = parseListQuery(await searchParams, spec);
  const tab = (query.filters.tab ?? "all") as Tab;
  const statuses = tabs[tab];
  const and: Prisma.BookingWhereInput[] = [];
  if (statuses) and.push({ status: { in: [...statuses] } });
  if (query.filters.status) and.push({ status: query.filters.status });
  if (query.filters.type) and.push({ eventType: query.filters.type });
  if (query.filters.paid === "unpaid") and.push({ paidCents: { lte: 0 }, totalCents: { gt: 0 } });
  if (query.filters.paid === "partly") and.push({ paidCents: { gt: 0 }, totalCents: { gt: db.booking.fields.paidCents } });
  if (query.filters.paid === "paid") and.push({ totalCents: { gt: 0, lte: db.booking.fields.paidCents } });
  if (query.q) {
    and.push({
      OR: [
        { trackingCode: { contains: query.q.toUpperCase() } },
        { customer: { OR: [{ name: { contains: query.q } }, { email: { contains: query.q } }] } },
        { venueName: { contains: query.q } },
        { venueCity: { contains: query.q } },
      ],
    });
  }
  const where: Prisma.BookingWhereInput = and.length ? { AND: and } : {};
  const orderBy: Prisma.BookingOrderByWithRelationInput[] =
    query.sort === "customer" ? [{ customer: { name: query.dir } }]
    : query.sort === "status" ? [{ status: query.dir }, { eventDate: "asc" }]
    : query.sort === "total" ? [{ totalCents: query.dir }]
    : query.sort === "created" ? [{ createdAt: query.dir }]
    : [{ eventDate: { sort: query.dir, nulls: "last" } }, { createdAt: "desc" }];

  const [t, te, tbs, format, total, any] = await Promise.all([
    getTranslations("bookings"),
    getTranslations("eventTypes"),
    getTranslations("bookingStatus"),
    getFormatter(),
    db.booking.count({ where }),
    db.booking.count(),
  ]);
  const win = pageWindow(query, total);
  const bookings = await db.booking.findMany({ where, orderBy, skip: win.skip, take: win.take, include: { customer: { select: { name: true } } } });

  if (any === 0) return <EmptyState icon={CalendarCheckIcon} title={t("emptyTitle")} description={t("emptyBody")} />;
  return (
    <div className="grid gap-4">
      <nav className="flex w-fit flex-wrap gap-1 rounded-lg bg-muted p-1" aria-label={t("status")}>
        {(Object.keys(tabs) as Tab[]).map((key) => (
          <Link
            key={key}
            href={listHref("/app/bookings", query, { tab: key === "all" ? null : key, status: null }, spec)}
            aria-current={key === tab ? "page" : undefined}
            className={cn("rounded-md px-3 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground", key === tab && "bg-background text-foreground shadow-sm")}
          >
            {t(tabLabels[key])}
          </Link>
        ))}
      </nav>
      <ServerTable
        spec={spec}
        total={total}
        count={bookings.length}
        placeholder={t("searchPlaceholder")}
        filters={[
          { key: "status", label: t("status"), options: (statuses ?? bookingStatuses).map((s) => ({ value: s, label: tbs(s) })) },
          { key: "type", label: t("event"), options: eventTypes.map((e) => ({ value: e, label: te(e) })) },
          { key: "paid", label: t("payment"), options: (["unpaid", "partly", "paid"] as const).map((p) => ({ value: p, label: t(`paid_${p}`) })) },
        ]}
        columns={[
          { label: t("customer"), sort: "customer" },
          { label: t("event") },
          { label: t("date"), sort: "date" },
          { label: t("status"), sort: "status" },
          { label: t("total"), sort: "total", align: "right" },
          { label: t("received"), sort: "created" },
        ]}
      >
        {bookings.map((b) => (
          <TableRow key={b.id} className="relative">
            <TableCell>
              <Link href={`/app/bookings/${b.trackingCode}`} className="font-medium after:absolute after:inset-0 hover:underline">
                {b.customer?.name ?? t("noCustomer")}
              </Link>
              <div className="font-mono text-xs text-muted-foreground">{b.trackingCode}</div>
            </TableCell>
            <TableCell>
              <div>{te(b.eventType as EventType)}</div>
              {(b.venueName || b.venueCity) && <div className="text-sm text-muted-foreground">{[b.venueName, b.venueCity].filter(Boolean).join(", ")}</div>}
            </TableCell>
            <TableCell className="whitespace-nowrap tabular-nums">{eventDate(format, b.eventDate, "short") ?? <span className="text-muted-foreground">{t("noDate")}</span>}</TableCell>
            <TableCell>
              <BookingStatusBadge status={b.status as BookingStatus} />
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {b.totalCents ? euro(format, b.totalCents, b.currency) : "—"}
              {b.totalCents > 0 && b.paidCents > 0 && b.paidCents < b.totalCents && <div className="text-xs text-muted-foreground">{t("paidSoFar", { amount: euro(format, b.paidCents, b.currency) })}</div>}
            </TableCell>
            <TableCell className="whitespace-nowrap text-sm text-muted-foreground tabular-nums">{format.dateTime(b.createdAt, { day: "numeric", month: "short", year: "numeric" })}</TableCell>
          </TableRow>
        ))}
      </ServerTable>
    </div>
  );
}
