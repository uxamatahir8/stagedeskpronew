import { ReceiptIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { pageWindow, parseListQuery } from "@stagedesk/core";
import type { Prisma } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Pill, type Tone } from "@/components/status-badge";
import { ServerTable } from "@/components/list/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { dateTime, euro } from "@/lib/format";
import { requireAgency } from "@/lib/viewer";

const tone: Record<string, Tone> = { sent: "info", accepted: "success", superseded: "neutral", declined: "danger", draft: "neutral" };

export async function generateMetadata({ params }: PageProps<"/[locale]/app/quotes">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "quotes" });
  return { title: t("title") };
}

export default async function QuotesPage({ params, searchParams }: PageProps<"/[locale]/app/quotes">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Quotes searchParams={searchParams} />
    </Suspense>
  );
}

const statuses = ["draft", "sent", "accepted", "superseded", "declined"];
const spec = { sorts: ["created", "customer", "status", "expires", "total"], defaultSort: "created", defaultDir: "desc" as const, filters: { status: statuses } };

async function Quotes({ searchParams }: Pick<PageProps<"/[locale]/app/quotes">, "searchParams">) {
  const { db } = await requireAgency("agency.quotes");
  const query = parseListQuery(await searchParams, spec);
  const where: Prisma.QuoteWhereInput = {
    ...(query.filters.status ? { status: query.filters.status } : {}),
    ...(query.q ? { booking: { OR: [{ trackingCode: { contains: query.q } }, { venueName: { contains: query.q } }, { customer: { OR: [{ name: { contains: query.q } }, { email: { contains: query.q } }] } }] } } : {}),
  };
  const orderBy: Prisma.QuoteOrderByWithRelationInput[] =
    query.sort === "customer" ? [{ booking: { customer: { name: query.dir } } }]
    : query.sort === "status" ? [{ status: query.dir }, { createdAt: "desc" }]
    : query.sort === "expires" ? [{ expiresAt: query.dir }]
    : query.sort === "total" ? [{ totalCents: query.dir }]
    : [{ createdAt: query.dir }];
  const [t, tb, ts, format, total, any] = await Promise.all([
    getTranslations("quotes"),
    getTranslations("bookings"),
    getTranslations("quoteStatus"),
    getFormatter(),
    db.quote.count({ where }),
    db.quote.count(),
  ]);
  const win = pageWindow(query, total);
  const quotes = await db.quote.findMany({
    where,
    orderBy,
    skip: win.skip,
    take: win.take,
    include: { booking: { select: { trackingCode: true, currency: true, customer: { select: { name: true } } } } },
  });
  const now = new Date();

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      {any === 0 ? (
        <EmptyState icon={ReceiptIcon} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <ServerTable
          spec={spec}
          total={total}
          count={quotes.length}
          placeholder={t("searchPlaceholder")}
          filters={[{ key: "status", label: tb("status"), options: statuses.map((s) => ({ value: s, label: ts(s as "sent") })) }]}
          columns={[
            { label: tb("customer"), sort: "customer" },
            { label: t("version") },
            { label: tb("status"), sort: "status" },
            { label: t("sentOn"), sort: "created" },
            { label: t("expires"), sort: "expires" },
            { label: tb("total"), sort: "total", align: "right" },
          ]}
        >
          {quotes.map((q) => (
            <TableRow key={q.id} className="relative">
              <TableCell>
                <Link href={`/app/bookings/${q.booking.trackingCode}`} className="font-medium after:absolute after:inset-0 hover:underline">
                  {q.booking.customer?.name ?? tb("noCustomer")}
                </Link>
                <div className="font-mono text-xs text-muted-foreground">{q.booking.trackingCode}</div>
              </TableCell>
              <TableCell className="tabular-nums">{q.version}</TableCell>
              <TableCell>
                <Pill tone={tone[q.status] ?? "neutral"}>{ts(q.status as "sent")}</Pill>
              </TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">{dateTime(format, q.sentAt ?? q.createdAt)}</TableCell>
              <TableCell className={q.status === "sent" && q.expiresAt < now ? "text-destructive" : undefined}>{q.status === "sent" ? dateTime(format, q.expiresAt) : "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{euro(format, q.totalCents, q.booking.currency)}</TableCell>
            </TableRow>
          ))}
        </ServerTable>
      )}
    </div>
  );
}
