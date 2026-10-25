import { DownloadIcon, FileImageIcon, FileTextIcon, ImageIcon, MailIcon, VideoIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import { getSetting, prisma } from "@stagedesk/db";
import { FormMessage } from "@/components/auth/auth-card";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { requireAffiliate } from "@/lib/affiliate";
import { percent } from "@/lib/format";
import { appUrl } from "@/lib/mail";
import { CopyField } from "@/components/copy-field";
import { LinkBuilder } from "./link-builder";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/links">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "nav" });
  return { title: t("links") };
}

export default async function LinksPage({ params }: PageProps<"/[locale]/app/links">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Links />
    </Suspense>
  );
}

const assetIcons = { logo: ImageIcon, banner: FileImageIcon, email: MailIcon, video: VideoIcon, other: FileTextIcon } as const;
const loc = (value: unknown, locale: string) => {
  const v = (value ?? {}) as Record<string, string>;
  return v[locale] || v["nl"] || "";
};

async function Links() {
  const { affiliate } = await requireAffiliate("affiliate.links");
  const [t, tn, format, locale, program, assets] = await Promise.all([
    getTranslations("affiliate"),
    getTranslations("nav"),
    getFormatter(),
    getLocale(),
    getSetting("affiliates.program"),
    prisma.affiliateAsset.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
  ]);

  return (
    <div className="grid gap-6">
      <PageHeader title={tn("links")} description={t("linksDescription")} />
      {affiliate.status !== "approved" ? (
        <FormMessage>{t(`status_${affiliate.status as "pending"}`)}</FormMessage>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("linkBuilder")}</CardTitle>
              <CardDescription>{t("linkBuilderHint", { days: program.cookieDays })}</CardDescription>
            </CardHeader>
            <CardContent>
              <LinkBuilder base={appUrl} code={affiliate.code} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("promoTitle")}</CardTitle>
              <CardDescription>
                {program.promoDiscountBps > 0
                  ? t("promoHint", { discount: percent(format, program.promoDiscountBps), months: program.promoDiscountMonths })
                  : t("promoHintNoDiscount")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CopyField label={t("yourCode")} value={affiliate.promoCode} />
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("assets")}</CardTitle>
          <CardDescription>{t("assetsHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          {assets.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noAssets")}</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {assets.map((a) => {
                const Icon = assetIcons[a.kind as keyof typeof assetIcons] ?? FileTextIcon;
                return (
                  <li key={a.id} className="flex items-start gap-3 rounded-lg border p-3">
                    <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="grid min-w-0 flex-1 gap-1">
                      <p className="font-medium">{loc(a.title, locale)}</p>
                      {loc(a.description, locale) && <p className="text-sm text-muted-foreground">{loc(a.description, locale)}</p>}
                    </div>
                    <Button asChild variant="ghost" size="icon-sm" aria-label={t("download")}>
                      <a href={a.url} target="_blank" rel="noopener">
                        <DownloadIcon />
                      </a>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
