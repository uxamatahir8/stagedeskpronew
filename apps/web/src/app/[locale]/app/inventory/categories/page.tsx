import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { listCategories } from "@stagedesk/db";
import { CategoryManager } from "@/components/inventory/category-manager";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireAgency, viewerCan } from "@/lib/viewer";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/inventory/categories">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "inventory" });
  return { title: t("categories") };
}

export default async function CategoriesPage({ params }: PageProps<"/[locale]/app/inventory/categories">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Categories />
    </Suspense>
  );
}

async function Categories() {
  await connection();
  const { viewer, organization } = await requireAgency("agency.inventory");
  const [t, categories] = await Promise.all([getTranslations("inventory"), listCategories(organization.id)]);
  return (
    <div className="grid max-w-3xl gap-6">
      <Link href="/app/inventory" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" />
        {t("back")}
      </Link>
      <PageHeader title={t("categories")} description={t("categoriesHint")} />
      <CategoryManager categories={categories} canManage={viewerCan(viewer, "agency.inventory.manage")} />
    </div>
  );
}
