import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { sharedItem } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireAgency } from "@/lib/viewer";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/inventory/shared/[id]">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "inventory" });
  return { title: t("sharedTitle"), robots: { index: false } };
}

export default function SharedItemPage({ params }: PageProps<"/[locale]/app/inventory/shared/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <Shared params={params} />
    </Suspense>
  );
}

/** One shared item, read-only. 404 the moment the owner stops sharing it. */
async function Shared({ params }: Pick<PageProps<"/[locale]/app/inventory/shared/[id]">, "params">) {
  await connection();
  const { locale, id } = await params;
  setRequestLocale(locale as Locale);
  const { organization } = await requireAgency("agency.inventory");
  const item = await sharedItem(organization.id, id.slice(0, 64));
  if (!item) notFound();
  const t = await getTranslations("inventory");
  const facts: [string, string][] = [
    [t("kind"), t(`kind_${item.kind as "item"}`)],
    [t("category"), item.category ?? "—"],
    [t("manufacturer"), item.manufacturer ?? "—"],
    [t("model"), item.model ?? "—"],
    [t("powerWatts"), item.powerWatts !== null ? `${item.powerWatts} W` : "—"],
    [t("batteryPowered"), item.batteryPowered ? t("yes") : t("no")],
  ];
  return (
    <div className="grid max-w-3xl gap-6">
      <Link href="/app/inventory/shared" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" />
        {t("sharedTitle")}
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{item.code}</span>
            <span>{item.name}</span>
          </span>
        }
        description={t("sharedBy", { agency: item.agency.name })}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t("details")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {facts.map(([label, value]) => (
              <div key={label} className="grid gap-0.5">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("owner")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1 text-sm">
          <p className="font-medium">{item.agency.name}</p>
          {item.agency.city && <p className="text-muted-foreground">{item.agency.city}</p>}
          {item.agency.bookingPage && (
            <Link href={item.agency.bookingPage} className="w-fit underline-offset-4 hover:underline">
              {t("bookingPage")}
            </Link>
          )}
          <p className="pt-2 text-xs text-muted-foreground">{t("sharedReadOnly")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
