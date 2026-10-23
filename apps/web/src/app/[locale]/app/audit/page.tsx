import { ScrollTextIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
const groups = ["all", "settings", "plan", "agency", "affiliate", "payment", "user", "ticket", "booking", "support"] as const;

async function Audit({ searchParams }: Pick<PageProps<"/[locale]/app/audit">, "searchParams">) {
  await requirePermission("platform.audit");
  const raw = (await searchParams)["group"];
  const group = groups.includes(raw as (typeof groups)[number]) ? (raw as (typeof groups)[number]) : "all";
  const [t, format, events] = await Promise.all([
    getTranslations("audit"),
    getFormatter(),
    prisma.auditEvent.findMany({ where: group === "all" ? {} : { action: { startsWith: `${group}.` } }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
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
            href={g === "all" ? "/app/audit" : `/app/audit?group=${g}`}
            aria-current={g === group ? "page" : undefined}
            className={cn("rounded-full border px-3 py-1", g === group ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground")}
          >
            {t(`group_${g}`)}
          </Link>
        ))}
      </nav>
      {events.length === 0 ? (
        <EmptyState icon={ScrollTextIcon} title={t("empty")} />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("when")}</TableHead>
                  <TableHead>{t("who")}</TableHead>
                  <TableHead>{t("what")}</TableHead>
                  <TableHead>{t("agency")}</TableHead>
                  <TableHead>{t("details")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
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
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
