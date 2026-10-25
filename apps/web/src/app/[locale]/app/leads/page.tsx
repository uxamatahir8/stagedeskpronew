import { CheckCircle2Icon, InboxIcon, SearchIcon, SendIcon, XCircleIcon } from "lucide-react";
import type { Metadata } from "next";
import { parseListQuery } from "@stagedesk/core";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import { leadStatuses, listLeads, type LeadStatus } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { FilterChips } from "@/components/list-controls";
import { ListPager, SortHead } from "@/components/list/list-controls";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { eventDate } from "@/lib/format";
import { requirePermission } from "@/lib/viewer";
import { leadTone } from "./lead-tone";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/leads">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "leads" });
  return { title: t("title") };
}

export default async function LeadsPage({ params, searchParams }: PageProps<"/[locale]/app/leads">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Leads searchParams={searchParams} />
    </Suspense>
  );
}

const spec = { sorts: ["created", "date", "name"], defaultSort: "created", defaultDir: "desc" as const };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

async function Leads({ searchParams }: Pick<PageProps<"/[locale]/app/leads">, "searchParams">) {
  await requirePermission("platform.agencies");
  const sp = await searchParams;
  const q = (one(sp["q"]) ?? "").trim().slice(0, 100);
  const requested = one(sp["status"]) as LeadStatus | undefined;
  const status = requested && leadStatuses.includes(requested) ? requested : null;
  const page = Math.max(1, Number.parseInt(one(sp["page"]) ?? "1", 10) || 1);
  const lq = parseListQuery(sp, spec);
  const [t, te, format, list] = await Promise.all([getTranslations("leads"), getTranslations("eventTypes"), getFormatter(), listLeads({ q, status, page, pageSize: lq.size, sort: lq.sort as "date", dir: lq.dir })]);
  const href = (patch: { status?: LeadStatus | null; page?: number }) => {
    const next = new URLSearchParams();
    const s = patch.status === undefined ? status : patch.status;
    if (q) next.set("q", q);
    if (s) next.set("status", s);
    if (patch.page && patch.page > 1) next.set("page", String(patch.page));
    const str = next.toString();
    return `/app/leads${str ? `?${str}` : ""}`;
  };
  const count = (s: LeadStatus) => list.byStatus[s] ?? 0;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button asChild variant="outline">
            <a href="/request" target="_blank" rel="noopener">
              {t("openForm")}
            </a>
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("status_new")} value={count("new")} icon={InboxIcon} tone="blue" hint={t("statNewHint")} />
        <StatCard label={t("status_offered")} value={count("offered")} icon={SendIcon} tone="amber" hint={t("statOfferedHint")} />
        <StatCard label={t("status_assigned")} value={count("assigned")} icon={CheckCircle2Icon} tone="teal" hint={t("statAssignedHint")} />
        <StatCard label={t("status_closed")} value={count("closed")} icon={XCircleIcon} tone="pink" hint={t("statClosedHint")} />
      </div>
      <div className="grid gap-3">
        <form className="flex flex-wrap gap-2" role="search">
          <label htmlFor="leads-q" className="sr-only">
            {t("search")}
          </label>
          <div className="relative min-w-60 flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="leads-q" name="q" defaultValue={q} placeholder={t("searchPlaceholder")} className="pl-9" />
          </div>
          {status && <input type="hidden" name="status" value={status} />}
          <Button type="submit" variant="outline">
            {t("search")}
          </Button>
        </form>
        <FilterChips
          label={t("filterStatus")}
          options={[null, ...leadStatuses].map((s) => ({ key: s ?? "all", label: s ? t(`status_${s}`) : t("all"), href: href({ status: s }), active: s === status }))}
        />
      </div>

      {list.rows.length === 0 ? (
        <EmptyState icon={InboxIcon} title={t("empty")} description={t("emptyHint")} />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead spec={spec} column="date">{t("request")}</SortHead>
                  <SortHead spec={spec} column="name">{t("customer")}</SortHead>
                  <TableHead>{t("statusLabel")}</TableHead>
                  <TableHead>{t("agencies")}</TableHead>
                  <SortHead spec={spec} column="created">{t("received")}</SortHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((l) => {
                  const declined = l.offers.filter((o) => o.status === "declined").length;
                  return (
                    <TableRow key={l.id}>
                      <TableCell>
                        <Link href={`/app/leads/${l.id}`} className="font-medium underline-offset-4 hover:underline">
                          {te(l.eventType as "wedding")} · {eventDate(format, l.eventDate, "short")}
                        </Link>
                        <div className="font-mono text-xs text-muted-foreground">
                          {l.reference}
                          {l.venueCity ? ` · ${l.venueCity}` : ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>{l.name}</div>
                        <div className="text-sm text-muted-foreground">{l.email}</div>
                      </TableCell>
                      <TableCell>
                        <Pill tone={leadTone[l.status as LeadStatus]}>{t(`status_${l.status as LeadStatus}`)}</Pill>
                      </TableCell>
                      <TableCell className="text-sm">
                        {l.assignedAgency ? (
                          <Link href={`/app/agencies/${l.assignedAgency.id}`} className="underline-offset-4 hover:underline">
                            {l.assignedAgency.name}
                          </Link>
                        ) : l.offers.length ? (
                          <span className="text-muted-foreground">{t("offersSummary", { count: l.offers.length, declined })}</span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{format.dateTime(l.createdAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <ListPager spec={spec} total={list.total} />
    </div>
  );
}
