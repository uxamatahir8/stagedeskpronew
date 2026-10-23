import { ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { agencyBilling, agencyDomains, siteEditorData } from "@stagedesk/db";
import { CopyField } from "@/components/copy-field";
import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { sitesBase, siteUrlFor } from "@/lib/site-request";
import { requireAgency } from "@/lib/viewer";
import { AddDomainForm, DomainActions } from "./controls";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/website/domain">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "websiteEditor" });
  return { title: t("domainTitle") };
}

export default async function DomainPage({ params }: PageProps<"/[locale]/app/website/domain">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Domains />
    </Suspense>
  );
}

const tone = { pending: "info", verified: "success", failed: "danger" } as const;
/** Where custom domains point: a hostname on the sites domain that the reverse proxy answers. */
const cnameTarget = process.env.SITES_CNAME_TARGET || `sites.${sitesBase}`;

async function Domains() {
  const { organization } = await requireAgency("agency.settings");
  const [t, format, domains, billing, editor] = await Promise.all([
    getTranslations("websiteEditor"),
    getFormatter(),
    agencyDomains(organization.id),
    agencyBilling(organization.id),
    siteEditorData(organization.id),
  ]);
  const free = siteUrlFor(organization.slug);
  const allowed = billing.limits.customDomain;

  return (
    <div className="grid max-w-3xl gap-6">
      <Link href="/app/website" className="flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" aria-hidden />
        {t("title")}
      </Link>
      <PageHeader title={t("domainTitle")} description={t("domainDescription")} />

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {t("freeAddress")}
            <Pill tone={editor.site.live ? "success" : "neutral"}>{t(editor.site.live ? "isLive" : editor.site.publishedAt ? "isOffline" : "notPublished")}</Pill>
          </CardTitle>
          <CardDescription>{t("freeAddressHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <CopyField label={t("address")} value={free} />
          {editor.site.live && (
            <Button asChild variant="outline" size="sm" className="w-fit">
              <a href={free} target="_blank" rel="noopener">
                <ExternalLinkIcon />
                {t("viewSite")}
              </a>
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("customDomain")}</CardTitle>
          <CardDescription>{allowed ? t("customDomainHint") : t("customDomainUpgrade")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {allowed && <AddDomainForm />}
          {domains.map((d) => (
            <div key={d.id} className="grid gap-4 rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-medium">
                  {d.hostname}
                  <Pill tone={tone[d.status as keyof typeof tone]}>{t(`domain_${d.status as keyof typeof tone}`)}</Pill>
                </span>
                <DomainActions domainId={d.id} verified={d.status === "verified"} />
              </div>
              {d.status === "verified" ? (
                <p className="text-sm text-muted-foreground">{t("domainLive", { date: format.dateTime(d.verifiedAt!, { day: "numeric", month: "long", year: "numeric" }) })}</p>
              ) : (
                <div className="grid gap-3">
                  <p className="text-sm">{t("dnsIntro")}</p>
                  <ol className="grid gap-3 text-sm">
                    <li className="grid gap-2">
                      <span className="font-medium">1. {t("dnsStep1")}</span>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <CopyField label={t("dnsType")} value="CNAME" />
                        <CopyField label={t("dnsName")} value={d.hostname} />
                        <CopyField label={t("dnsValue")} value={cnameTarget} />
                      </div>
                    </li>
                    <li className="grid gap-2">
                      <span className="font-medium">2. {t("dnsStep2")}</span>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <CopyField label={t("dnsType")} value="TXT" />
                        <CopyField label={t("dnsName")} value={`_stagedesk.${d.hostname}`} />
                        <CopyField label={t("dnsValue")} value={d.token} />
                      </div>
                    </li>
                    <li className="font-medium">3. {t("dnsStep3")}</li>
                  </ol>
                  {d.lastError && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{d.lastError}</p>}
                  {d.hostname.endsWith(".localhost") && <p className="text-xs text-muted-foreground">{t("localDomainHint")}</p>}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
