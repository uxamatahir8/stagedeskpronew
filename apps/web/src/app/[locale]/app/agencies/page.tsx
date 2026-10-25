import { BadgeCheckIcon, BuildingIcon, HourglassIcon, PauseCircleIcon, SearchIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import { feeRuleSchema, parseListQuery } from "@stagedesk/core";
import { activePlans, type AgencyStatusFilter, agencyStatusFilters, listAgencies, prisma } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { FilterChips } from "@/components/list-controls";
import { ListPager, SortHead } from "@/components/list/list-controls";
import { StatCard } from "@/components/stat-card";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requirePermission } from "@/lib/viewer";
import { CreateAgencyDialog } from "./agency-dialogs";
import { FeeDealDialog } from "./fee-deal";
import { NativeSelect } from "@/components/ui/native-select";
import { SearchForm } from "@/components/search-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/agencies">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "agencies" });
  return { title: t("title") };
}

export default function AgenciesPage({ searchParams }: PageProps<"/[locale]/app/agencies">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Agencies searchParams={searchParams} />
    </Suspense>
  );
}

const statusTone = {
  trialing: "info",
  active: "success",
  past_due: "warning",
  unpaid: "danger",
  canceled: "neutral",
  incomplete: "warning",
} as const;

const spec = { sorts: ["created", "name", "bookings", "members"], defaultSort: "created", defaultDir: "desc" as const };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

async function Agencies({ searchParams }: Pick<PageProps<"/[locale]/app/agencies">, "searchParams">) {
  await requirePermission("platform.agencies");
  setRequestLocale((await getLocale()) as Locale);
  const query = await searchParams;
  const q = one(query["q"])?.slice(0, 100) ?? "";
  const status = agencyStatusFilters.includes(one(query["status"]) as AgencyStatusFilter) ? (one(query["status"]) as AgencyStatusFilter) : null;
  const planKey = one(query["plan"]) || null;
  const page = Math.max(1, Number(one(query["page"])) || 1);
  const lq = parseListQuery(query, spec);

  // Platform-wide view: deliberately not tenant-scoped.
  const [t, ta, tf, ts, format, locale, list, plans, totals] = await Promise.all([
    getTranslations("agencies"),
    getTranslations("agencyAdmin"),
    getTranslations("agencyFee"),
    getTranslations("subStatus"),
    getFormatter(),
    getLocale(),
    listAgencies({ q, status, planKey, page, pageSize: lq.size, sort: lq.sort as "name", dir: lq.dir }),
    activePlans(),
    Promise.all([
      prisma.organization.count(),
      prisma.subscription.count({ where: { status: "trialing", organization: { suspendedAt: null } } }),
      prisma.subscription.count({ where: { status: "active", organization: { suspendedAt: null } } }),
      prisma.organization.count({ where: { suspendedAt: { not: null } } }),
    ]),
  ]);
  const [all, trialing, active, suspendedCount] = totals;
  const href = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const merged = { q: q || null, status, plan: planKey, page: null as string | null, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    const s = next.toString();
    return `/app/agencies${s ? `?${s}` : ""}`;
  };
  const planName = (name: unknown, key: string) => String(((name ?? {}) as Record<string, string>)[locale] ?? key);

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} actions={<CreateAgencyDialog />} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={ta("statAll")} value={all} icon={BuildingIcon} tone="violet" />
        <StatCard label={ta("statActive")} value={active} icon={BadgeCheckIcon} tone="teal" />
        <StatCard label={ta("statTrialing")} value={trialing} icon={HourglassIcon} tone="blue" />
        <StatCard label={ta("statSuspended")} value={suspendedCount} icon={PauseCircleIcon} tone="pink" />
      </div>

      <div className="grid gap-3">
        <SearchForm className="flex flex-wrap gap-2" role="search">
          <label htmlFor="ag-q" className="sr-only">
            {ta("search")}
          </label>
          <div className="relative min-w-60 flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="ag-q" name="q" defaultValue={q} placeholder={ta("searchPlaceholder")} className="pl-9" />
          </div>
          {status && <input type="hidden" name="status" value={status} />}
          <label htmlFor="ag-plan" className="sr-only">
            {ta("plan")}
          </label>
          <NativeSelect id="ag-plan" name="plan" defaultValue={planKey ?? ""} className="h-9 rounded-md border bg-background px-3 text-sm">
            <option value="">{ta("allPlans")}</option>
            {plans.map((p) => (
              <option key={p.id} value={p.key}>
                {planName(p.name, p.key)}
              </option>
            ))}
          </NativeSelect>
          <Button type="submit" variant="outline">
            {ta("search")}
          </Button>
        </SearchForm>
        <FilterChips
          label={ta("filterStatus")}
          options={[null, ...agencyStatusFilters].map((s) => ({
            key: s ?? "all",
            label: s === null ? ta("allStatuses") : s === "suspended" ? ta("suspendedLabel") : ts(s),
            href: href({ status: s }),
            active: s === status,
          }))}
        />
      </div>

      {list.rows.length === 0 ? (
        <EmptyState icon={BuildingIcon} title={q || status || planKey ? ta("noResults") : t("emptyTitle")} description={q || status || planKey ? ta("noResultsHint") : t("emptyBody")} />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead spec={spec} column="name">{t("name")}</SortHead>
                  <TableHead>{t("owner")}</TableHead>
                  <TableHead>{tf("plan")}</TableHead>
                  <TableHead>{tf("status")}</TableHead>
                  <SortHead spec={spec} column="bookings" align="right">{ta("bookings")}</SortHead>
                  <SortHead spec={spec} column="members" align="right">{t("members")}</SortHead>
                  <SortHead spec={spec} column="created">{t("created")}</SortHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((a) => {
                  const owner = a.members[0]?.user;
                  const sub = a.subscription;
                  const subStatus = (sub?.status ?? "none") as keyof typeof statusTone | "none";
                  const fee = feeRuleSchema.safeParse(a.feeRule);
                  return (
                    <TableRow key={a.id}>
                      <TableCell>
                        <Link href={`/app/agencies/${a.id}`} className="font-medium underline-offset-4 hover:underline">
                          {a.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          <span className="font-mono">{a.slug}</span>
                          {a.city ? ` · ${a.city}` : ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        {owner ? (
                          <>
                            <div>{owner.name}</div>
                            <div className="text-sm text-muted-foreground">{owner.email}</div>
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {sub ? planName(sub.plan.name, sub.plan.key) : "—"}
                        {sub?.complimentary && <div className="text-xs text-muted-foreground">{ta("complimentary")}</div>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {a.suspendedAt ? <Pill tone="danger">{ta("suspendedLabel")}</Pill> : <Pill tone={subStatus === "none" ? "neutral" : statusTone[subStatus]}>{ts(subStatus)}</Pill>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{a._count.bookings}</TableCell>
                      <TableCell className="text-right tabular-nums">{a._count.members}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">{format.dateTime(a.createdAt, { day: "numeric", month: "short", year: "numeric" })}</TableCell>
                      <TableCell className="text-right">
                        <FeeDealDialog organizationId={a.id} agency={a.name} rule={a.feeRule && fee.success ? fee.data : null} />
                      </TableCell>
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
