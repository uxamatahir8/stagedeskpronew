import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { todayInNetherlands } from "@stagedesk/core";
import { prisma, withdrawalDetail } from "@stagedesk/db";
import { WithdrawalCommissions, WithdrawalSummary, WithdrawalTimeline } from "@/components/affiliate/withdrawal-parts";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requirePermission } from "@/lib/viewer";
import { WithdrawalActions } from "../../withdrawal-controls";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/affiliates/withdrawals/[id]">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "withdrawals" });
  return { title: t("detailTitle") };
}

export default function AdminWithdrawalPage({ params }: PageProps<"/[locale]/app/affiliates/withdrawals/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Withdrawal params={params} />
    </Suspense>
  );
}

/** One withdrawal for the platform admin: who, where to, every step, every commission, and what to do next. */
async function Withdrawal({ params }: Pick<PageProps<"/[locale]/app/affiliates/withdrawals/[id]">, "params">) {
  const { id, locale } = await params;
  setRequestLocale(locale as Locale);
  await requirePermission("platform.affiliates");
  const payout = await withdrawalDetail(id);
  if (!payout) notFound();
  const t = await getTranslations("withdrawals");
  const actorIds = [...new Set(payout.events.map((e) => e.actorId).filter((x): x is string => Boolean(x) && x !== "system"))];
  const actors = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } });
  return (
    <div className="grid gap-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href="/app/affiliates?tab=withdrawals">
          <ArrowLeftIcon />
          {t("backToWithdrawals")}
        </Link>
      </Button>
      <PageHeader
        title={`${t("detailTitle")} ${payout.reference ?? ""}`}
        description={`${payout.affiliate.user.name} · ${payout.affiliate.user.email}`}
        actions={<WithdrawalActions payoutId={payout.id} status={payout.status} method={payout.method} today={todayInNetherlands()} />}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <WithdrawalSummary payout={payout} />
        <WithdrawalTimeline payout={payout} names={Object.fromEntries(actors.map((a) => [a.id, a.name]))} />
      </div>
      <WithdrawalCommissions payout={payout} />
    </div>
  );
}
