import { AlertTriangleIcon, BoxesIcon, PackageCheckIcon, TruckIcon, WrenchIcon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { equipmentKinds, equipmentStatuses, parseListQuery } from "@stagedesk/core";
import { inventoryStats, listCategories, listItems, prisma } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { ExportButton } from "@/components/export-button";
import { IfCan } from "@/components/if-can";
import { ItemFormDialog } from "@/components/inventory/item-form-dialog";
import { EquipmentStatusPill } from "@/components/inventory/labels";
import { ServerTable } from "@/components/list/data-table";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireAgency } from "@/lib/viewer";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/inventory">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "inventory" });
  return { title: t("title") };
}

export default async function InventoryPage({ params, searchParams }: PageProps<"/[locale]/app/inventory">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Inventory searchParams={searchParams} />
    </Suspense>
  );
}

async function Inventory({ searchParams }: Pick<PageProps<"/[locale]/app/inventory">, "searchParams">) {
  await connection();
  const { organization, db } = await requireAgency("agency.inventory");
  const [t, categories, any] = await Promise.all([getTranslations("inventory"), listCategories(organization.id), db.equipmentItem.count()]);
  const spec = {
    sorts: ["code"],
    defaultSort: "code",
    defaultDir: "asc" as const,
    filters: { status: equipmentStatuses, kind: equipmentKinds, category: categories.map((c) => c.id) },
    pageSize: 50,
  };
  const query = parseListQuery(await searchParams, spec);
  const [list, stats, containers] = await Promise.all([
    listItems(organization.id, { q: query.q, status: query.filters.status, kind: query.filters.kind, categoryId: query.filters.category, page: query.page, pageSize: query.size }),
    inventoryStats(organization.id),
    db.equipmentItem.findMany({ where: { kind: { in: ["case", "set"] }, status: { not: "retired" } }, select: { id: true, code: true, name: true, kind: true }, orderBy: { code: "asc" } }),
  ]);
  const sharing = (await prisma.organization.findUniqueOrThrow({ where: { id: organization.id }, select: { inventorySharing: true } })).inventorySharing;

  return (
    <div className="grid gap-8">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/app/inventory/categories">{t("categories")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/app/inventory/packages">{t("packages")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/app/inventory/shared">{t("sharedTitle")}</Link>
            </Button>
            <ExportButton kind="equipment" />
            <IfCan permission="agency.inventory.manage">
              <ItemFormDialog categories={categories} containers={containers} />
            </IfCan>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} icon={BoxesIcon} label={t("statAssets")} value={stats.assets} hint={stats.stockUnits ? t("statStockUnits", { count: stats.stockUnits }) : t("statAvailable", { count: stats.available })} />
        <StatCard index={1} icon={TruckIcon} label={t("statOut")} value={stats.out} hint={t("statOverdue", { count: stats.overdue })} />
        <StatCard index={2} icon={AlertTriangleIcon} label={t("statMissing")} value={stats.missing} hint={t("statLost", { count: stats.lost })} tone={stats.missing > 0 ? "pink" : undefined} />
        <StatCard index={3} icon={WrenchIcon} label={t("statDefective")} value={stats.defective} hint={t("statMaintenance", { count: stats.maintenance })} />
      </div>
      {stats.unreserved > 0 && (
        <p className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <PackageCheckIcon className="size-4 shrink-0" />
          {t("unreservedNotice", { count: stats.unreserved })}
        </p>
      )}
      <p className="text-sm text-muted-foreground">{sharing ? t("sharingOn") : t("sharingOff")}</p>

      {any === 0 ? (
        <EmptyState icon={BoxesIcon} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <ServerTable
          spec={spec}
          total={list.total}
          count={list.items.length}
          placeholder={t("searchPlaceholder")}
          filters={[
            { key: "status", label: t("status"), options: equipmentStatuses.map((s) => ({ value: s, label: t(`status_${s}`) })) },
            { key: "kind", label: t("kind"), options: equipmentKinds.map((k) => ({ value: k, label: t(`kind_${k}`) })) },
            ...(categories.length ? [{ key: "category", label: t("category"), options: categories.map((c) => ({ value: c.id, label: c.name })) }] : []),
          ]}
          columns={[{ label: t("code"), sort: "code" }, { label: t("name") }, { label: t("category"), className: "hidden lg:table-cell" }, { label: t("stock"), align: "right" }, { label: t("status") }]}
        >
          {list.items.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-mono text-sm whitespace-nowrap">
                <Link href={`/app/inventory/${item.id}`} className="font-medium underline-offset-4 hover:underline">
                  {item.code}
                </Link>
              </TableCell>
              <TableCell>
                <div className="grid gap-0.5">
                  <span>{item.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {[
                      item.kind !== "item" ? t(`kind_${item.kind as "case"}`) + (item._count.contents ? ` · ${t("contentsCount", { count: item._count.contents })}` : "") : null,
                      item.container ? t("inContainer", { code: item.container.code }) : null,
                      [item.manufacturer, item.model].filter(Boolean).join(" ") || null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              </TableCell>
              {/* Hidden below desktop width so stock and status stay in view on tablets. */}
              <TableCell className="hidden lg:table-cell">{item.category?.name ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums whitespace-nowrap">
                {item.tracking === "bulk" ? t("stockOf", { quantity: item.quantity, defective: item.defectiveQty }) : item.kind === "set" ? "—" : 1}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {item.kind !== "set" && <EquipmentStatusPill status={item.status} />}
                  {item.missing > 0 ? <Pill tone="danger">{t("missingCount", { count: item.missing })}</Pill> : item.out > 0 && <Pill tone="brand">{t("outCount", { count: item.out })}</Pill>}
                  {item.excludeFromSharing && <Pill>{t("private")}</Pill>}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </ServerTable>
      )}
    </div>
  );
}
