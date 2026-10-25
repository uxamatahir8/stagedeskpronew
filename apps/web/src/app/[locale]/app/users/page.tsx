import { MailWarningIcon, SearchIcon, ShieldCheckIcon, UsersRoundIcon, UserXIcon } from "lucide-react";
import type { Metadata } from "next";
import { parseListQuery } from "@stagedesk/core";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import { listUsers, prisma, userFilters, type UserFilter } from "@stagedesk/db";
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
import { requirePermission } from "@/lib/viewer";
import { CreateAdminDialog, UserActions } from "./user-menu";
import { SearchForm } from "@/components/search-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/users">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "users" });
  return { title: t("title") };
}

export default async function UsersPage({ params, searchParams }: PageProps<"/[locale]/app/users">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Users searchParams={searchParams} />
    </Suspense>
  );
}

const spec = { sorts: ["created", "name", "email"], defaultSort: "created", defaultDir: "desc" as const };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

async function Users({ searchParams }: Pick<PageProps<"/[locale]/app/users">, "searchParams">) {
  const viewer = await requirePermission("platform.users");
  const sp = await searchParams;
  const q = (one(sp["q"]) ?? "").trim().slice(0, 100);
  const requested = one(sp["filter"]) as UserFilter | undefined;
  const filter: UserFilter = requested && userFilters.includes(requested) ? requested : "all";
  const page = Math.max(1, Number.parseInt(one(sp["page"]) ?? "1", 10) || 1);
  const lq = parseListQuery(sp, spec);
  // Platform-wide view: deliberately not tenant-scoped.
  const [t, tr, format, list, totals] = await Promise.all([
    getTranslations("users"),
    getTranslations("roles"),
    getFormatter(),
    listUsers({ q, filter, page, pageSize: lq.size, sort: lq.sort as "name", dir: lq.dir }),
    Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { platformRole: "platform_admin" } }),
      prisma.user.count({ where: { emailVerified: false } }),
      prisma.user.count({ where: { disabledAt: { not: null } } }),
    ]),
  ]);
  const [all, admins, unverified, disabled] = totals;
  const href = (patch: { filter?: UserFilter; page?: number }) => {
    const next = new URLSearchParams();
    const f = patch.filter ?? filter;
    if (q) next.set("q", q);
    if (f !== "all") next.set("filter", f);
    if (patch.page && patch.page > 1) next.set("page", String(patch.page));
    const s = next.toString();
    return `/app/users${s ? `?${s}` : ""}`;
  };
  const date = (d: Date) => format.dateTime(d, { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} actions={<CreateAdminDialog />} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t("statAll")} value={all} icon={UsersRoundIcon} tone="violet" />
        <StatCard label={t("statAdmins")} value={admins} icon={ShieldCheckIcon} tone="pink" />
        <StatCard label={t("statUnverified")} value={unverified} icon={MailWarningIcon} tone="amber" />
        <StatCard label={t("statDisabled")} value={disabled} icon={UserXIcon} tone="teal" />
      </div>

      <div className="grid gap-3">
        <SearchForm className="flex flex-wrap gap-2" role="search">
          <label htmlFor="users-q" className="sr-only">
            {t("search")}
          </label>
          <div className="relative min-w-60 flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="users-q" name="q" defaultValue={q} placeholder={t("searchPlaceholder")} className="pl-9" />
          </div>
          {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
          <Button type="submit" variant="outline">
            {t("search")}
          </Button>
        </SearchForm>
        <FilterChips label={t("filter")} options={userFilters.map((f) => ({ key: f, label: t(`filter_${f}`), href: href({ filter: f }), active: f === filter }))} />
      </div>

      {list.rows.length === 0 ? (
        <EmptyState icon={UsersRoundIcon} title={t("noResults")} description={t("noResultsHint")} />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortHead spec={spec} column="name">{t("user")}</SortHead>
                  <TableHead>{t("roles")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>{t("lastActive")}</TableHead>
                  <SortHead spec={spec} column="created">{t("joined")}</SortHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.rows.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium">{u.name}</div>
                      <div className="text-sm text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {u.platformRole && <div>{tr(u.platformRole as "platform_admin")}</div>}
                      {u.members.map((m) => (
                        <div key={m.id}>
                          {tr(m.role as "agency_owner")} ·{" "}
                          <Link href={`/app/agencies/${m.organization.id}`} className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                            {m.organization.name}
                          </Link>
                        </div>
                      ))}
                      {!u.platformRole && u.members.length === 0 && <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.disabledAt ? <Pill tone="danger">{t("statusDisabled")}</Pill> : <Pill tone="success">{t("statusActive")}</Pill>}
                        {!u.emailVerified && <Pill tone="warning">{t("unverified")}</Pill>}
                        {u.twoFactorEnabled && <Pill tone="info">2FA</Pill>}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{u.sessions[0] ? date(u.sessions[0].updatedAt) : "—"}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{date(u.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <UserActions
                        user={{ id: u.id, name: u.name, email: u.email, phone: u.phone ?? "" }}
                        disabled={Boolean(u.disabledAt)}
                        verified={u.emailVerified}
                        twoFactor={Boolean(u.twoFactorEnabled)}
                        self={u.id === viewer.user.id}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <ListPager spec={spec} total={list.total} />
    </div>
  );
}
