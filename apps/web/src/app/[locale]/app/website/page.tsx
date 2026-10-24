import { GlobeIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { agencyDomains, siteEditorData } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { loadSiteData } from "@/lib/site-data";
import { showBranding, siteUrlFor } from "@/lib/site-request";
import { requireAgency } from "@/lib/viewer";
import { SiteEditor } from "./editor";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/website">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "websiteEditor" });
  return { title: t("title") };
}

export default async function WebsitePage({ params }: PageProps<"/[locale]/app/website">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-[48rem] w-full" />}>
      <Website />
    </Suspense>
  );
}

async function Website() {
  const { organization } = await requireAgency("agency.website");
  const [t, editor, data, branding, domains] = await Promise.all([
    getTranslations("websiteEditor"),
    siteEditorData(organization.id),
    loadSiteData(organization.id),
    showBranding(organization.id),
    agencyDomains(organization.id),
  ]);
  const verified = domains.find((d) => d.status === "verified")?.hostname;
  const pages = editor.pages.map((p) => ({ id: p.id, slug: p.slug, inNav: p.inNav, draft: p.draft, changed: p.changed }));

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button asChild variant="outline">
            <Link href="/app/website/domain">
              <GlobeIcon />
              {t("domainSettings")}
            </Link>
          </Button>
        }
      />
      <SiteEditor
        // The page list comes from the server; remount when it changes (pending edits are saved first).
        key={pages.map((p) => `${p.id}:${p.slug}`).join("|")}
        initialPages={pages}
        initialTheme={editor.site.theme}
        initialEnglish={editor.site.englishEnabled}
        data={{ ...data, booking: null }}
        live={editor.site.live}
        publishedAt={editor.site.publishedAt?.toISOString() ?? null}
        siteUrl={siteUrlFor(organization.slug, verified)}
        branding={branding}
      />
    </div>
  );
}
