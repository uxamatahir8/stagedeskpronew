import { LifeBuoyIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { type Prisma, prisma, ticketCategories } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/status-badge";
import { ServerTable } from "@/components/list/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { listHref, pageWindow, parseListQuery } from "@stagedesk/core";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/lib/viewer";
import { NewTicketDialog } from "./support-forms";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/support">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "support" });
  return { title: t("title") };
}

export default async function SupportPage({ params, searchParams }: PageProps<"/[locale]/app/support">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Support searchParams={searchParams} />
    </Suspense>
  );
}

const statusTone = { open: "warning", answered: "info", closed: "neutral" } as const;
const statuses = ["open", "answered", "closed"] as const;
const spec = { sorts: ["updated", "subject", "created"], defaultSort: "updated", defaultDir: "desc" as const, filters: { status: [...statuses], category: [...ticketCategories] } };

async function Support({ searchParams }: Pick<PageProps<"/[locale]/app/support">, "searchParams">) {
  const viewer = await requirePermission("support");
  const staff = viewer.permissions.includes("platform.support");
  const query = parseListQuery(await searchParams, spec);
  // Staff start on the open tickets; customers see all of theirs.
  const filter = (query.filters.status as (typeof statuses)[number] | undefined) ?? (staff ? "open" : null);
  const where: Prisma.SupportTicketWhereInput = {
    ...(staff ? {} : { userId: viewer.user.id }),
    ...(filter ? { status: filter } : {}),
    ...(query.filters.category ? { category: query.filters.category } : {}),
    ...(query.q ? { OR: [{ subject: { contains: query.q } }, { reference: { contains: query.q.toUpperCase() } }, { user: { OR: [{ name: { contains: query.q } }, { email: { contains: query.q } }] } }] } : {}),
  };
  const total = await prisma.supportTicket.count({ where });
  const win = pageWindow(query, total);
  const [t, format, tickets, counts] = await Promise.all([
    getTranslations("support"),
    getFormatter(),
    prisma.supportTicket.findMany({
      where,
      orderBy: query.sort === "subject" ? { subject: query.dir } : query.sort === "created" ? { createdAt: query.dir } : { lastMessageAt: query.dir },
      skip: win.skip,
      take: win.take,
      include: { user: { select: { name: true, email: true } }, _count: { select: { messages: true } } },
    }),
    staff ? prisma.supportTicket.groupBy({ by: ["status"], _count: { _all: true } }) : [],
  ]);
  const agencies = staff
    ? await prisma.organization.findMany({ where: { id: { in: tickets.flatMap((x) => (x.agencyId ? [x.agencyId] : [])) } }, select: { id: true, name: true } })
    : [];

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t(staff ? "descriptionStaff" : "description")} actions={staff ? undefined : <NewTicketDialog />} />
      {staff && (
        <nav className="flex w-fit gap-1 rounded-lg bg-muted p-1 text-sm" aria-label={t("filter")}>
          {statuses.map((s) => (
            <Link
              key={s}
              href={listHref("/app/support", query, { status: s }, spec)}
              aria-current={s === filter ? "page" : undefined}
              className={cn("rounded-md px-3 py-1.5", s === filter ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {t(`status_${s}`)} <span className="tabular-nums text-muted-foreground">{counts.find((c) => c.status === s)?._count._all ?? 0}</span>
            </Link>
          ))}
        </nav>
      )}
      {total === 0 && !query.q && !query.filters.category ? (
        <EmptyState icon={LifeBuoyIcon} title={t(staff ? "emptyStaff" : "empty")} description={staff ? undefined : t("emptyHint")} />
      ) : (
        <ServerTable
          spec={spec}
          total={total}
          count={tickets.length}
          placeholder={t(staff ? "searchPlaceholderStaff" : "searchPlaceholder")}
          filters={[
            ...(staff ? [] : [{ key: "status", label: t("status"), options: statuses.map((st) => ({ value: st, label: t(`userStatus_${st}`) })) }]),
            { key: "category", label: t("category"), options: ticketCategories.map((c) => ({ value: c, label: t(`category_${c}`) })) },
          ]}
          columns={[
            { label: t("subject"), sort: "subject" },
            ...(staff ? [{ label: t("from") }] : []),
            { label: t("category") },
            { label: t("status") },
            { label: t("updated"), sort: "updated", align: "right" as const },
          ]}
        >
          {tickets.map((x) => (
            <TableRow key={x.id}>
              <TableCell>
                <Link href={`/app/support/${x.reference}`} className="font-medium underline-offset-4 hover:underline">
                  {x.subject}
                </Link>
                <div className="font-mono text-xs text-muted-foreground">
                  {x.reference} · {t("messageCount", { count: x._count.messages })}
                </div>
              </TableCell>
              {staff && (
                <TableCell>
                  <div>{x.user.name}</div>
                  <div className="text-xs text-muted-foreground">{agencies.find((a) => a.id === x.agencyId)?.name ?? x.user.email}</div>
                </TableCell>
              )}
              <TableCell>{t(`category_${x.category as "other"}`)}</TableCell>
              <TableCell>
                <Pill tone={statusTone[x.status as keyof typeof statusTone] ?? "neutral"}>{t(staff ? `status_${x.status as "open"}` : `userStatus_${x.status as "open"}`)}</Pill>
              </TableCell>
              <TableCell className="text-right whitespace-nowrap tabular-nums">
                {format.dateTime(x.lastMessageAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </TableCell>
            </TableRow>
          ))}
        </ServerTable>
      )}
    </div>
  );
}
