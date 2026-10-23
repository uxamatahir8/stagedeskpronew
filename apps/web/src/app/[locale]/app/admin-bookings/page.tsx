import { ArrowRightIcon, CalendarCheckIcon, CircleCheckIcon, SearchIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { bookingStatuses, type BookingStatus } from "@stagedesk/core";
import { bookingSources, type BookingSource, listAllBookings, prisma } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { FilterChips, Pager } from "@/components/list-controls";
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
import { startSupportAction } from "@/lib/support-actions";
import { requirePermission } from "@/lib/viewer";
import { NewBookingPicker } from "./pick-agency";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/admin-bookings">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "adminBookings" });
  return { title: t("title") };
}

export default async function AdminBookingsPage({ params, searchParams }: PageProps<"/[locale]/app/admin-bookings">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Bookings searchParams={searchParams} />
    </Suspense>
  );
}

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

async function Bookings({ searchParams }: Pick<PageProps<"/[locale]/app/admin-bookings">, "searchParams">) {
  await requirePermission("platform.agencies");
  const sp = await searchParams;
  const q = (one(sp["q"]) ?? "").trim().slice(0, 100);
  const requested = one(sp["status"]);
  const status = requested && (bookingStatuses as readonly string[]).includes(requested) ? (requested as BookingStatus) : null;
  const agencyId = one(sp["agency"]) || null;
  const requestedSource = one(sp["source"]) as BookingSource | undefined;
  const source = requestedSource && bookingSources.includes(requestedSource) ? requestedSource : null;
  // Set after a platform admin created a booking, to confirm it and offer to open it.
  const created = one(sp["created"]);
  const page = Math.max(1, Number.parseInt(one(sp["page"]) ?? "1", 10) || 1);
  // Platform-wide view: deliberately not tenant-scoped.
  const [t, ts, te, format, list, agencies] = await Promise.all([
    getTranslations("adminBookings"),
    getTranslations("bookingStatus"),
    getTranslations("eventTypes"),
    getFormatter(),
    listAllBookings({ q, status, organizationId: agencyId, source, page }),
    prisma.organization.findMany({ where: { suspendedAt: null }, select: { id: true, name: true, city: true }, orderBy: { name: "asc" } }),
  ]);
  const createdBooking = created
    ? await prisma.booking.findUnique({ where: { trackingCode: created }, select: { trackingCode: true, organizationId: true, organization: { select: { name: true } } } })
    : null;
  // Who created the admin bookings in this page, to name them.
  const creators = await prisma.user.findMany({
    where: { id: { in: [...new Set(list.rows.filter((b) => b.source === "platform_admin" && b.createdById).map((b) => b.createdById!))] } },
    select: { id: true, name: true },
  });
  const href = (patch: { status?: string | null; source?: string | null; page?: number }) => {
    const next = new URLSearchParams();
    const s = patch.status === undefined ? status : patch.status;
    const src = patch.source === undefined ? source : patch.source;
    if (q) next.set("q", q);
    if (s) next.set("status", s);
    if (src) next.set("source", src);
    if (agencyId) next.set("agency", agencyId);
    if (patch.page && patch.page > 1) next.set("page", String(patch.page));
    const str = next.toString();
    return `/app/admin-bookings${str ? `?${str}` : ""}`;
  };

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} actions={<NewBookingPicker agencies={agencies} />} />
      {createdBooking && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/40 bg-success/10 px-4 py-3">
          <p className="flex items-center gap-2 text-sm">
            <CircleCheckIcon className="size-4 shrink-0 text-success" aria-hidden />
            {t("created", { code: createdBooking.trackingCode, agency: createdBooking.organization.name })}
          </p>
          <form action={startSupportAction.bind(null, createdBooking.organizationId, `/app/bookings/${createdBooking.trackingCode}`)}>
            <Button type="submit" size="sm" variant="outline">
              {t("openCreated")}
              <ArrowRightIcon />
            </Button>
          </form>
        </div>
      )}
      <div className="grid gap-3">
        <form className="flex flex-wrap gap-2" role="search">
          <label htmlFor="pb-q" className="sr-only">
            {t("search")}
          </label>
          <div className="relative min-w-60 flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="pb-q" name="q" defaultValue={q} placeholder={t("searchPlaceholder")} className="pl-9" />
          </div>
          {status && <input type="hidden" name="status" value={status} />}
          <label htmlFor="pb-agency-filter" className="sr-only">
            {t("agency")}
          </label>
          <select id="pb-agency-filter" name="agency" defaultValue={agencyId ?? ""} className="h-9 rounded-md border bg-background px-3 text-sm">
            <option value="">{t("allAgencies")}</option>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline">
            {t("search")}
          </Button>
        </form>
        <FilterChips
          label={t("filterSource")}
          options={[null, ...bookingSources].map((src) => ({ key: src ?? "all", label: src ? t(`source_${src}`) : t("allSources"), href: href({ source: src }), active: src === source }))}
        />
        <FilterChips
          label={t("filterStatus")}
          options={[null, ...bookingStatuses].map((s) => ({ key: s ?? "all", label: s ? ts(s) : t("allStatuses"), href: href({ status: s }), active: s === status }))}
        />
      </div>

      {list.rows.length === 0 ? (
        <EmptyState icon={CalendarCheckIcon} title={t("empty")} description={t("emptyHint")} />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("booking")}</TableHead>
                  <TableHead>{t("agency")}</TableHead>
                  <TableHead>{t("customer")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead className="text-right">{t("total")}</TableHead>
                  <TableHead>{t("created")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <div className="font-medium">
                        {te(b.eventType as "wedding")} · {eventDate(format, b.eventDate, "short")}
                      </div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {b.trackingCode}
                        {b.venueCity ? ` · ${b.venueCity}` : ""}
                        {b.source !== "manual" ? ` · ${t(`source_${b.source as BookingSource}`)}` : ""}
                        {b.source === "platform_admin" && creators.find((c) => c.id === b.createdById) ? ` (${creators.find((c) => c.id === b.createdById)!.name})` : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link href={`/app/agencies/${b.organization.id}`} className="underline-offset-4 hover:underline">
                        {b.organization.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {b.customer ? (
                        <>
                          <div>{b.customer.name}</div>
                          <div className="text-sm text-muted-foreground">{b.customer.email}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <BookingStatusBadge status={b.status as BookingStatus} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{b.totalCents ? euro(format, b.totalCents) : "—"}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{format.dateTime(b.createdAt, { day: "numeric", month: "short", year: "numeric" })}</TableCell>
                    <TableCell className="text-right">
                      {/* Opens the booking inside its agency, in support mode. */}
                      <form action={startSupportAction.bind(null, b.organization.id, `/app/bookings/${b.trackingCode}`)}>
                        <Button type="submit" variant="ghost" size="sm" aria-label={t("openBooking", { code: b.trackingCode })}>
                          {t("open")}
                          <ArrowRightIcon />
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <Pager page={page} pages={list.pages} total={list.total} href={(p) => href({ page: p })} />
    </div>
  );
}
