import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { withdrawalDetail } from "@stagedesk/db";
import { WithdrawalCommissions, WithdrawalSummary, WithdrawalTimeline } from "@/components/affiliate/withdrawal-parts";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireAffiliate } from "@/lib/affiliate";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/payouts/[id]">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "withdrawals" });
  return { title: t("detailTitle") };
}

export default function WithdrawalPage({ params }: PageProps<"/[locale]/app/payouts/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Withdrawal params={params} />
    </Suspense>
  );
}

/** One withdrawal as the affiliate sees it: amount, where it goes, every step and every commission in it. */
async function Withdrawal({ params }: Pick<PageProps<"/[locale]/app/payouts/[id]">, "params">) {
  const { id, locale } = await params;
  setRequestLocale(locale as Locale);
  const { affiliate, viewer } = await requireAffiliate("affiliate.payouts");
  const payout = await withdrawalDetail(id);
  if (!payout || payout.affiliateId !== affiliate.id) notFound();
  const t = await getTranslations("withdrawals");
  return (
    <div className="grid gap-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href="/app/payouts">
          <ArrowLeftIcon />
          {t("backToPayouts")}
        </Link>
      </Button>
      <PageHeader title={t("detailTitle")} description={t("detailBody")} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <WithdrawalSummary payout={payout} />
        <WithdrawalTimeline payout={payout} names={{ [viewer.user.id]: viewer.user.name }} />
      </div>
      <WithdrawalCommissions payout={payout} />
    </div>
  );
}
