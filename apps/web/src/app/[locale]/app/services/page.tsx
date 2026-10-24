import { TagIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { getSetting } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/list/data-table";
import { Skeleton } from "@/components/ui/skeleton";
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

const spec = { sorts: ["name", "unit", "price", "vat"], defaultDir: "asc" as const, filters: { unit: ["hour", "piece", "flat"] } };

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
        <DataTable
          spec={spec}
          placeholder={t("searchPlaceholder")}
          filters={[{ key: "unit", label: t("unit"), options: [...new Set(items.map((s) => s.unit))].map((u) => ({ value: u, label: tu(u as "hour") })) }]}
          columns={[{ label: t("name"), sort: "name" }, { label: t("unit"), sort: "unit" }, { label: t("price"), sort: "price", align: "right" }, { label: t("vat"), sort: "vat", align: "right" }, { label: "", className: "w-0" }]}
          rows={items.map((s) => ({
            id: s.id,
            text: `${s.name} ${s.description ?? ""}`,
            values: { name: s.name, unit: tu(s.unit as "hour"), price: s.unitPriceCents, vat: s.vatBps },
            facets: { unit: s.unit },
            cells: [
              <div key="n">
                <div className="font-medium">{s.name}</div>
                {s.description && <div className="max-w-md truncate text-sm text-muted-foreground">{s.description}</div>}
              </div>,
              tu(s.unit as "hour"),
              euro(format, s.unitPriceCents, organization.currency),
              percent(format, s.vatBps),
              <div key="a" className="flex justify-end gap-1">
                <ServiceDialog
                  vatRates={defaults.vatRatesBps}
                  service={{ id: s.id, name: s.name, description: s.description ?? "", unit: s.unit as "hour", price: centsToInput(s.unitPriceCents, locale), vatBps: s.vatBps }}
                />
                <ArchiveService id={s.id} />
              </div>,
            ],
          }))}
        />
      )}
    </div>
  );
}
