import { CalendarCheckIcon, PlusIcon, SearchIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { BookingStatus, EventType } from "@stagedesk/core";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { BookingStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { euro, eventDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requireAgency } from "@/lib/viewer";

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
          <Button asChild>
            <Link href="/app/bookings/new">
              <PlusIcon />
              {t("new")}
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <BookingList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function BookingList({ searchParams }: Pick<PageProps<"/[locale]/app/bookings">, "searchParams">) {
  const { db } = await requireAgency("agency.bookings");
  const sp = await searchParams;
  const tab: Tab = typeof sp["tab"] === "string" && sp["tab"] in tabs ? (sp["tab"] as Tab) : "all";
  const q = typeof sp["q"] === "string" ? sp["q"].trim().slice(0, 100) : "";
  const statuses = tabs[tab];

  const [t, te, format, bookings] = await Promise.all([
    getTranslations("bookings"),
    getTranslations("eventTypes"),
    getFormatter(),
    db.booking.findMany({
      where: {
        ...(statuses ? { status: { in: [...statuses] } } : {}),
        ...(q
          ? { OR: [{ trackingCode: { contains: q.toUpperCase() } }, { customer: { name: { contains: q } } }, { venueCity: { contains: q } }] }
          : {}),
      },
      include: { customer: { select: { name: true } } },
      orderBy: [{ eventDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      take: 200,
    }),
  ]);

  const href = (next: Partial<{ tab: Tab; q: string }>) => {
    const params = new URLSearchParams();
    const nextTab = next.tab ?? tab;
    const nextQ = next.q ?? q;
    if (nextTab !== "all") params.set("tab", nextTab);
    if (nextQ) params.set("q", nextQ);
    const s = params.toString();
    return `/app/bookings${s ? `?${s}` : ""}`;
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1 rounded-lg bg-muted p-1" aria-label={t("status")}>
          {(Object.keys(tabs) as Tab[]).map((key) => (
            <Link
              key={key}
              href={href({ tab: key })}
              aria-current={key === tab ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                key === tab && "bg-background text-foreground shadow-sm",
              )}
            >
              {t(tabLabels[key])}
            </Link>
          ))}
        </nav>
        <form className="relative w-full sm:w-72" action="">
          {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder={t("search")} className="pl-8" aria-label={t("search")} />
        </form>
      </div>

      {bookings.length === 0 ? (
        <EmptyState icon={CalendarCheckIcon} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("customer")}</TableHead>
                  <TableHead>{t("event")}</TableHead>
                  <TableHead>{t("date")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead className="text-right">{t("total")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
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
                      {b.venueCity && <div className="text-sm text-muted-foreground">{b.venueCity}</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {eventDate(format, b.eventDate, "short") ?? <span className="text-muted-foreground">{t("noDate")}</span>}
                    </TableCell>
                    <TableCell>
                      <BookingStatusBadge status={b.status as BookingStatus} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{b.totalCents ? euro(format, b.totalCents) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
