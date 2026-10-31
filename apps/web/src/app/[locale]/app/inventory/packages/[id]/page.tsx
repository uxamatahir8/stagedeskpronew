import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { listCategories, packageDetail, pickableItems } from "@stagedesk/db";
import { PackageEditor } from "@/components/inventory/package-editor";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireAgency, viewerCan } from "@/lib/viewer";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/inventory/packages/[id]">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "inventory" });
  return { title: t("packages") };
}

export default function PackagePage({ params }: PageProps<"/[locale]/app/inventory/packages/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Package params={params} />
    </Suspense>
  );
}

async function Package({ params }: Pick<PageProps<"/[locale]/app/inventory/packages/[id]">, "params">) {
  await connection();
  const { locale, id } = await params;
  setRequestLocale(locale as Locale);
  const { viewer, organization } = await requireAgency("agency.inventory");
  const canManage = viewerCan(viewer, "agency.inventory.manage");
  const isNew = id === "new";
  if (isNew && !canManage) notFound();
  const [t, pkg, items, categories] = await Promise.all([
    getTranslations("inventory"),
    isNew ? Promise.resolve(null) : packageDetail(organization.id, id.slice(0, 64)),
    pickableItems(organization.id),
    listCategories(organization.id),
  ]);
  if (!isNew && !pkg) notFound();
  return (
    <div className="grid max-w-3xl gap-6">
      <Link href="/app/inventory/packages" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" />
        {t("packages")}
      </Link>
      <PageHeader title={pkg?.name ?? t("newPackage")} description={t("packageEditorHint")} />
      <PackageEditor
        pkg={pkg ? { id: pkg.id, name: pkg.name, description: pkg.description, lines: pkg.lines.map((l) => ({ itemId: l.itemId, categoryId: l.categoryId, quantity: l.quantity })) } : null}
        items={items.filter((i) => i.kind !== "set")}
        categories={categories}
        canManage={canManage}
      />
    </div>
  );
}
