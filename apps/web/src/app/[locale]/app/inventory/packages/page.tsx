import { ArrowLeftIcon, PackageIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { listPackages } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { IfCan } from "@/components/if-can";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireAgency } from "@/lib/viewer";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/inventory/packages">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "inventory" });
  return { title: t("packages") };
}

export default async function PackagesPage({ params }: PageProps<"/[locale]/app/inventory/packages">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Packages />
    </Suspense>
  );
}

async function Packages() {
  await connection();
  const { organization } = await requireAgency("agency.inventory");
  const [t, packages] = await Promise.all([getTranslations("inventory"), listPackages(organization.id)]);
  return (
    <div className="grid max-w-3xl gap-6">
      <Link href="/app/inventory" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" />
        {t("back")}
      </Link>
      <PageHeader
        title={t("packages")}
        description={t("packagesHint")}
        actions={
          <IfCan permission="agency.inventory.manage">
            <Button asChild>
              <Link href="/app/inventory/packages/new">
                <PlusIcon />
                {t("newPackage")}
              </Link>
            </Button>
          </IfCan>
        }
      />
      {packages.length === 0 ? (
        <EmptyState icon={PackageIcon} title={t("noPackagesTitle")} description={t("noPackagesBody")} />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {packages.map((p) => (
            <li key={p.id}>
              <Link href={`/app/inventory/packages/${p.id}`} className="grid gap-0.5 px-4 py-3 hover:bg-muted/50">
                <span className="font-medium">{p.name}</span>
                <span className="text-xs text-muted-foreground">
                  {t("linesCount", { count: p._count.lines })}
                  {p.description ? ` · ${p.description}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
