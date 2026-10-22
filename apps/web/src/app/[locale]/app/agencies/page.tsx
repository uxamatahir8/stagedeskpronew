import { BuildingIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Locale } from "@/i18n/routing";
import { requirePermission } from "@/lib/viewer";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/agencies">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "agencies" });
  return { title: t("title") };
}

export default async function AgenciesPage({ params }: PageProps<"/[locale]/app/agencies">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Agencies />
    </Suspense>
  );
}

async function Agencies() {
  await requirePermission("platform.agencies");
  // Platform-wide view: deliberately not tenant-scoped.
  const [t, format, agencies] = await Promise.all([
    getTranslations("agencies"),
    getFormatter(),
    prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { members: true } },
        members: { where: { role: "agency_owner" }, take: 1, include: { user: { select: { name: true, email: true } } } },
      },
    }),
  ]);

  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} />
      {agencies.length === 0 ? (
        <EmptyState icon={BuildingIcon} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("city")}</TableHead>
                  <TableHead>{t("owner")}</TableHead>
                  <TableHead className="text-right">{t("members")}</TableHead>
                  <TableHead>{t("created")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agencies.map((a) => {
                  const owner = a.members[0]?.user;
                  return (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div className="font-medium">{a.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{a.slug}</div>
                      </TableCell>
                      <TableCell>{a.city ?? "—"}</TableCell>
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
                      <TableCell className="text-right tabular-nums">{a._count.members}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {format.dateTime(a.createdAt, { day: "numeric", month: "short", year: "numeric" })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
