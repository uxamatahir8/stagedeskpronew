import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Locale } from "@/i18n/routing";
import { requirePermission } from "@/lib/viewer";
import { UserActions } from "./user-menu";

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

const PAGE = 50;

async function Users({ searchParams }: Pick<PageProps<"/[locale]/app/users">, "searchParams">) {
  const viewer = await requirePermission("platform.users");
  const raw = (await searchParams)["q"];
  const q = typeof raw === "string" ? raw.trim().slice(0, 100) : "";
  // Platform-wide view: deliberately not tenant-scoped.
  const where = q ? { OR: [{ email: { contains: q } }, { name: { contains: q } }] } : {};
  const [t, tr, format, users, total] = await Promise.all([
    getTranslations("users"),
    getTranslations("roles"),
    getFormatter(),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE,
      include: { members: { include: { organization: { select: { name: true } } } }, sessions: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } } },
    }),
    prisma.user.count({ where }),
  ]);

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <form className="flex max-w-md gap-2" role="search">
        <label htmlFor="users-q" className="sr-only">
          {t("search")}
        </label>
        <Input id="users-q" name="q" defaultValue={q} placeholder={t("searchPlaceholder")} />
        <Button type="submit" variant="outline">
          {t("search")}
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">{t("count", { shown: users.length, total })}</p>
      <Card>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("user")}</TableHead>
                <TableHead>{t("roles")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead>{t("lastActive")}</TableHead>
                <TableHead>{t("joined")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="font-medium">{u.name}</div>
                    <div className="text-sm text-muted-foreground">{u.email}</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {u.platformRole && <div>{tr(u.platformRole as "platform_admin")}</div>}
                    {u.members.map((m) => (
                      <div key={m.id}>
                        {tr(m.role as "agency_owner")} <span className="text-muted-foreground">· {m.organization.name}</span>
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
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {u.sessions[0] ? format.dateTime(u.sessions[0].updatedAt, { day: "numeric", month: "short", year: "numeric" }) : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{format.dateTime(u.createdAt, { day: "numeric", month: "short", year: "numeric" })}</TableCell>
                  <TableCell className="text-right">
                    <UserActions
                      userId={u.id}
                      name={u.name}
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
    </div>
  );
}
