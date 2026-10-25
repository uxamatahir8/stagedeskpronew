import { ScrollTextIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import { listHref, pageWindow, parseListQuery } from "@stagedesk/core";
import { type Prisma, prisma } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { ServerTable } from "@/components/list/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/lib/viewer";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/audit">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "audit" });
  return { title: t("title") };
}

export default async function AuditPage({ params, searchParams }: PageProps<"/[locale]/app/audit">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Audit searchParams={searchParams} />
    </Suspense>
  );
}

/** Filter groups by action prefix. */
const groups = ["all", "settings", "plan", "agency", "affiliate", "payment", "user", "ticket", "booking", "lead", "support", "site"] as const;

const spec = { sorts: ["when", "action"], defaultSort: "when", defaultDir: "desc" as const, filters: { group: groups.filter((g) => g !== "all") } };

async function Audit({ searchParams }: Pick<PageProps<"/[locale]/app/audit">, "searchParams">) {
  await requirePermission("platform.audit");
  const query = parseListQuery(await searchParams, spec);
  const group = (query.filters.group ?? "all") as (typeof groups)[number];
  const and: Prisma.AuditEventWhereInput[] = [];
  if (group !== "all") and.push({ action: { startsWith: `${group}.` } });
  if (query.q) {
    // Who did it is a user; match names and emails first.
    const people = await prisma.user.findMany({ where: { OR: [{ name: { contains: query.q } }, { email: { contains: query.q } }] }, select: { id: true }, take: 200 });
    const agencies = await prisma.organization.findMany({ where: { name: { contains: query.q } }, select: { id: true }, take: 200 });
    and.push({
      OR: [
        { action: { contains: query.q } },
        { targetId: { contains: query.q } },
        { ip: { contains: query.q } },
        { actorId: { in: people.map((p) => p.id) } },
        { agencyId: { in: agencies.map((o) => o.id) } },
      ],
    });
  }
  const where: Prisma.AuditEventWhereInput = and.length ? { AND: and } : {};
  const [t, format, total] = await Promise.all([getTranslations("audit"), getFormatter(), prisma.auditEvent.count({ where })]);
  const win = pageWindow(query, total);
  const events = await prisma.auditEvent.findMany({
    where,
    orderBy: query.sort === "action" ? [{ action: query.dir }, { createdAt: "desc" }] : [{ createdAt: query.dir }],
    skip: win.skip,
    take: win.take,
  });
  const ids = (key: "actorId" | "agencyId") => [...new Set(events.flatMap((e) => (e[key] ? [e[key]!] : [])))];
  const [actors, agencies] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids("actorId") } }, select: { id: true, name: true } }),
    prisma.organization.findMany({ where: { id: { in: ids("agencyId") } }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <nav className="flex flex-wrap gap-1 text-sm" aria-label={t("filter")}>
        {groups.map((g) => (
          <Link
            key={g}
            href={listHref("/app/audit", query, { group: g === "all" ? null : g }, spec)}
            aria-current={g === group ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1", g === group ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground")}
          >
            {t(`group_${g}`)}
          </Link>
        ))}
      </nav>
      {total === 0 && !query.q && group === "all" ? (
        <EmptyState icon={ScrollTextIcon} title={t("empty")} />
      ) : (
        <ServerTable
          spec={spec}
          total={total}
          count={events.length}
          placeholder={t("searchPlaceholder")}
          columns={[{ label: t("when"), sort: "when" }, { label: t("who") }, { label: t("what"), sort: "action" }, { label: t("agency") }, { label: t("details") }]}
        >
          {events.map((e) => (
            <TableRow key={String(e.id)}>
              <TableCell className="whitespace-nowrap tabular-nums">
                {format.dateTime(e.createdAt, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </TableCell>
              <TableCell>{actors.find((a) => a.id === e.actorId)?.name ?? t("system")}</TableCell>
              <TableCell>
                <div>{t.has(`action.${e.action}` as "action.user.disable") ? t(`action.${e.action}` as "action.user.disable") : e.action}</div>
                {e.targetId && <div className="font-mono text-xs text-muted-foreground">{e.targetType}:{e.targetId.slice(0, 12)}</div>}
              </TableCell>
              <TableCell>{agencies.find((a) => a.id === e.agencyId)?.name ?? "—"}</TableCell>
              <TableCell className="max-w-xs">
                {e.data ? <code className="block truncate text-xs text-muted-foreground" title={JSON.stringify(e.data)}>{JSON.stringify(e.data)}</code> : "—"}
                {e.ip && <div className="text-xs text-muted-foreground">IP {e.ip}</div>}
              </TableCell>
            </TableRow>
          ))}
        </ServerTable>
      )}
    </div>
  );
}
