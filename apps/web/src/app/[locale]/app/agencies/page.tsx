import { BuildingIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { feeRuleSchema } from "@stagedesk/core";
import { prisma } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Locale } from "@/i18n/routing";
import { requirePermission } from "@/lib/viewer";
import { FeeDealDialog } from "./fee-deal";

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

const statusTone = {
  trialing: "info",
  active: "success",
  past_due: "warning",
  unpaid: "danger",
  canceled: "neutral",
  incomplete: "warning",
} as const;

async function Agencies() {
  await requirePermission("platform.agencies");
  // Platform-wide view: deliberately not tenant-scoped.
  const [t, tf, ts, format, locale, agencies] = await Promise.all([
    getTranslations("agencies"),
    getTranslations("agencyFee"),
    getTranslations("subStatus"),
    getFormatter(),
    getLocale(),
    prisma.organization.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { members: true } },
        members: { where: { role: "agency_owner" }, take: 1, include: { user: { select: { name: true, email: true } } } },
        subscription: { include: { plan: { select: { key: true, name: true } } } },
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
                  <TableHead>{t("owner")}</TableHead>
                  <TableHead>{tf("plan")}</TableHead>
                  <TableHead>{tf("status")}</TableHead>
                  <TableHead className="text-right">{t("members")}</TableHead>
                  <TableHead>{t("created")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {agencies.map((a) => {
                  const owner = a.members[0]?.user;
                  const sub = a.subscription;
                  const status = (sub?.status ?? "none") as keyof typeof statusTone | "none";
                  const fee = feeRuleSchema.safeParse(a.feeRule);
                  return (
                    <TableRow key={a.id}>
                      <TableCell>
                        <div className="font-medium">{a.name}</div>
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
                      <TableCell>{sub ? String(((sub.plan.name ?? {}) as Record<string, string>)[locale] ?? sub.plan.key) : "—"}</TableCell>
                      <TableCell>
                        <Pill tone={status === "none" ? "neutral" : statusTone[status]}>{ts(status)}</Pill>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{a._count.members}</TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {format.dateTime(a.createdAt, { day: "numeric", month: "short", year: "numeric" })}
                      </TableCell>
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
    </div>
  );
}
