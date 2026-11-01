import { ArrowLeftIcon, Share2Icon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { parseListQuery } from "@stagedesk/core";
import { sharedInventory } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { ServerTable } from "@/components/list/data-table";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireAgency } from "@/lib/viewer";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/inventory/shared">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "inventory" });
  return { title: t("sharedTitle") };
}

export default async function SharedInventoryPage({ params, searchParams }: PageProps<"/[locale]/app/inventory/shared">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Shared searchParams={searchParams} />
    </Suspense>
  );
}

/** Other agencies' equipment they chose to share: public fields only, read-only. */
async function Shared({ searchParams }: Pick<PageProps<"/[locale]/app/inventory/shared">, "searchParams">) {
  await connection();
  const { organization } = await requireAgency("agency.inventory");
  const t = await getTranslations("inventory");
  const raw = await searchParams;
  const first = await sharedInventory(organization.id, { pageSize: 1 });
  const spec = { sorts: ["agency"], defaultSort: "agency", defaultDir: "asc" as const, filters: { agency: first.agencies.map((a) => a.id) }, pageSize: 50 };
  const query = parseListQuery(raw, spec);
  const list = await sharedInventory(organization.id, { q: query.q, agencyId: query.filters.agency ?? null, page: query.page, pageSize: query.size });

  return (
    <div className="grid gap-6">
      <Link href="/app/inventory" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" />
        {t("back")}
      </Link>
      <PageHeader title={t("sharedTitle")} description={t("sharedHint")} />
      {first.total === 0 ? (
        <EmptyState icon={Share2Icon} title={t("sharedEmptyTitle")} description={t("sharedEmptyBody")} />
      ) : (
        <ServerTable
          spec={spec}
          total={list.total}
          count={list.items.length}
          placeholder={t("searchPlaceholder")}
          filters={[{ key: "agency", label: t("agency"), options: list.agencies.map((a) => ({ value: a.id, label: a.name })) }]}
          columns={[{ label: t("agency"), sort: "agency" }, { label: t("code") }, { label: t("name") }, { label: t("category") }, { label: t("powerWatts"), align: "right" }]}
        >
          {list.items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <div className="grid gap-0.5">
                  <span className="font-medium">{item.agency.name}</span>
                  {item.agency.city && <span className="text-xs text-muted-foreground">{item.agency.city}</span>}
                </div>
              </TableCell>
              <TableCell className="font-mono text-sm whitespace-nowrap">
                <Link href={`/app/inventory/shared/${item.id}`} className="underline-offset-4 hover:underline">
                  {item.code}
                </Link>
              </TableCell>
              <TableCell>
                <div className="grid gap-0.5">
                  <span>{item.name}</span>
                  <span className="text-xs text-muted-foreground">{[item.kind === "case" ? t("kind_case") : null, [item.manufacturer, item.model].filter(Boolean).join(" ") || null].filter(Boolean).join(" · ")}</span>
                </div>
              </TableCell>
              <TableCell>{item.category ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{item.powerWatts !== null ? `${item.powerWatts} W` : "—"}</TableCell>
            </TableRow>
          ))}
        </ServerTable>
      )}
    </div>
  );
}
