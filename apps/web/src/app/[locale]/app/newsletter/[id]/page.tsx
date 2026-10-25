import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { audienceSize, campaignArticleChoices, prisma } from "@stagedesk/db";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { requirePermission } from "@/lib/viewer";
import { CampaignEditor } from "./campaign-editor";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/newsletter/[id]">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "newsletter" });
  return { title: t("title") };
}

export default async function CampaignPage({ params }: PageProps<"/[locale]/app/newsletter/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
      <Campaign params={params} />
    </Suspense>
  );
}

type Text = { title?: string; excerpt?: string } | null;

/** Reads the campaign id inside the Suspense boundary: it's request data. */
async function Campaign({ params }: Pick<PageProps<"/[locale]/app/newsletter/[id]">, "params">) {
  const { locale: raw, id } = await params;
  const locale = raw as Locale;
  setRequestLocale(locale);
  const viewer = await requirePermission("platform.newsletter");
  const campaign = id === "new" ? null : await prisma.newsletterCampaign.findUnique({ where: { id } });
  if (id !== "new" && !campaign) notFound();
  const [articles, all, nl, en] = await Promise.all([campaignArticleChoices(), audienceSize("all"), audienceSize("nl"), audienceSize("en")]);
  return (
    <CampaignEditor
      campaign={
        campaign
          ? {
              id: campaign.id,
              subjectNl: campaign.subjectNl,
              subjectEn: campaign.subjectEn,
              bodyNl: campaign.bodyNl,
              bodyEn: campaign.bodyEn,
              articleIds: (campaign.articleIds as string[]) ?? [],
              audience: campaign.audience as "all",
              status: campaign.status,
              scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
              sentAt: campaign.sentAt?.toISOString() ?? null,
              recipients: campaign.recipients,
              sentCount: campaign.sentCount,
              failedCount: campaign.failedCount,
            }
          : null
      }
      articles={articles.map((a) => {
        const text = ((locale === "en" ? (a.en as Text) : null) ?? (a.nl as Text)) || {};
        return { id: a.id, title: text.title ?? a.slug, date: a.publishedAt?.toISOString().slice(0, 10) ?? "" };
      })}
      audienceSizes={{ all, nl, en }}
      testEmail={viewer.user.email}
    />
  );
}
