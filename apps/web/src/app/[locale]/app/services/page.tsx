import { TagIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { getSetting } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Locale } from "@/i18n/routing";
import { centsToInput, euro, percent } from "@/lib/format";
import { requireAgency } from "@/lib/viewer";
import { ArchiveService, ServiceDialog } from "./service-dialog";
import { IfCan } from "@/components/if-can";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/services">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "services" });
  return { title: t("title") };
}

export default async function ServicesPage({ params }: PageProps<"/[locale]/app/services">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Services />
    </Suspense>
  );
}

async function Services() {
  const { db, organization } = await requireAgency("agency.services");
  const [t, tu, format, locale, items, defaults] = await Promise.all([
    getTranslations("services"),
    getTranslations("units"),
    getFormatter(),
    getLocale(),
    db.serviceItem.findMany({ where: { active: true }, orderBy: [{ position: "asc" }, { name: "asc" }] }),
    getSetting("bookings.defaults"),
  ]);

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} actions={
          <IfCan permission="agency.services">
            <ServiceDialog vatRates={defaults.vatRatesBps} />
          </IfCan>
        } />
      {items.length === 0 ? (
        <EmptyState icon={TagIcon} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("unit")}</TableHead>
                  <TableHead className="text-right">{t("price")}</TableHead>
                  <TableHead className="text-right">{t("vat")}</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="font-medium">{s.name}</div>
                      {s.description && <div className="text-sm text-muted-foreground">{s.description}</div>}
                    </TableCell>
                    <TableCell>{tu(s.unit as "hour")}</TableCell>
                    <TableCell className="text-right tabular-nums">{euro(format, s.unitPriceCents, organization.currency)}</TableCell>
                    <TableCell className="text-right tabular-nums">{percent(format, s.vatBps)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <ServiceDialog
                          vatRates={defaults.vatRatesBps}
                          service={{
                            id: s.id,
                            name: s.name,
                            description: s.description ?? "",
                            unit: s.unit as "hour",
                            price: centsToInput(s.unitPriceCents, locale),
                            vatBps: s.vatBps,
                          }}
                        />
                        <ArchiveService id={s.id} />
                      </div>
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
