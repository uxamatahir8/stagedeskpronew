import { ConstructionIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { footerNavigation, navigation } from "@/config/navigation";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

// Every sidebar entry that isn't built yet resolves here and says which phase builds it.
const planned = [...navigation.flatMap((g) => g.items), ...footerNavigation].filter((item) => item.phase);

export function generateStaticParams() {
  return planned.map((item) => ({ section: item.href.replace(/^\/app\//, "").split("/") }));
}

function itemFor(section: string[]) {
  return planned.find((item) => item.href === `/app/${section.join("/")}`);
}

export async function generateMetadata({ params }: PageProps<"/[locale]/app/[...section]">): Promise<Metadata> {
  const { locale, section } = await params;
  const item = itemFor(section);
  if (!item) return {};
  const t = await getTranslations({ locale: locale as Locale, namespace: "nav" });
  return { title: t(item.key) };
}

export default async function PlannedPage({ params }: PageProps<"/[locale]/app/[...section]">) {
  const { locale, section } = await params;
  setRequestLocale(locale as Locale);
  const item = itemFor(section);
  if (!item?.phase) notFound();

  const t = await getTranslations();
  const page = t(`nav.${item.key}`);

  return (
    <div className="grid gap-8">
      <PageHeader title={page} />
      <EmptyState
        icon={ConstructionIcon}
        title={t("placeholder.title", { page })}
        description={t("placeholder.body", { phase: item.phase, phaseName: t(`phases.${item.phase}`) })}
        action={
          <Button variant="outline" asChild>
            <Link href="/app">{t("placeholder.back")}</Link>
          </Button>
        }
      />
    </div>
  );
}
