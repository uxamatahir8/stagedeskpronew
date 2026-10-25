import { CalendarCheckIcon, GiftIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import { agencyReferralCode, getSetting, prisma } from "@stagedesk/db";
import { CopyField } from "@/components/copy-field";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Pill } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/list/data-table";
import type { Locale } from "@/i18n/routing";
import { referralLink } from "@/lib/affiliate";
import { eventDate } from "@/lib/format";
import { requireAgency } from "@/lib/viewer";

const spec = { sorts: ["joined", "agency", "paid"], defaultSort: "joined", defaultDir: "desc" as const, filters: { state: ["joined", "trial", "paying", "rewarded", "rejected"] } };

export async function generateMetadata({ params }: PageProps<"/[locale]/app/referrals">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "nav" });
  return { title: t("referrals") };
}

export default async function ReferralsPage({ params }: PageProps<"/[locale]/app/referrals">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Referrals />
    </Suspense>
  );
}

/**
 * Give a month, get a month: the agency's invite link (straight to agency
 * registration), every agency that joined with it and the free months earned.
 */
async function Referrals() {
  const { organization } = await requireAgency("agency.referrals");
  const [t, tn, format, program, code, referred, own] = await Promise.all([
    getTranslations("agencyReferral"),
    getTranslations("nav"),
    getFormatter(),
    getSetting("affiliates.program"),
    agencyReferralCode(organization.id),
    prisma.referral.findMany({
      where: { referringAgencyId: organization.id },
      orderBy: { createdAt: "desc" },
      include: { agency: { select: { name: true, subscription: { select: { status: true } } } } },
    }),
    prisma.referral.findUnique({ where: { agencyId: organization.id }, include: { affiliate: { include: { user: { select: { name: true } } } }, referringAgency: { select: { name: true } } } }),
  ]);
  const months = program.agencyReferralFreeMonths;
  const paying = referred.filter((r) => r.firstPaidAt).length;
  const rewarded = referred.filter((r) => r.rewardedAt).length;
  const state = (r: (typeof referred)[number]) =>
    r.status === "rejected" ? "rejected" : r.rewardedAt ? "rewarded" : r.firstPaidAt ? "paying" : r.agency.subscription?.status === "trialing" ? "trial" : "joined";
  const tone = { rejected: "danger", rewarded: "success", paying: "success", trial: "info", joined: "neutral" } as const;

  return (
    <div className="grid gap-6">
      <PageHeader title={tn("referrals")} description={months > 0 ? t("pageDescription", { count: months }) : t("programOff")} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} icon={UsersIcon} label={t("statJoined")} value={referred.length} />
        <StatCard index={1} icon={CalendarCheckIcon} label={t("statPaying")} value={paying} />
        <StatCard index={2} icon={GiftIcon} label={t("statRewarded")} value={rewarded} hint={t("monthsEarned", { count: rewarded * months })} />
        <StatCard index={3} icon={UserPlusIcon} label={t("statConversion")} value={referred.length ? `${Math.round((paying / referred.length) * 100)}%` : "—"} />
      </div>
      {months > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GiftIcon className="size-4 text-primary" aria-hidden />
              {t("title", { count: months })}
            </CardTitle>
            <CardDescription>{t("body", { count: months })}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <CopyField label={t("link")} value={referralLink(code, null, "/sign-up")} />
            <ol className="grid gap-3 text-sm sm:grid-cols-3">
              {([1, 2, 3] as const).map((i) => (
                <li key={i} className="grid grid-cols-[1.75rem_1fr] gap-2">
                  <span className="grid size-7 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i}</span>
                  <span className="text-muted-foreground">{t(`step${i}`, { count: months })}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t("referredTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {referred.length === 0 ? (
            <EmptyState icon={UsersIcon} title={t("noneYet")} description={t("noneYetHint")} />
          ) : (
            <DataTable
              spec={spec}
              placeholder={t("searchPlaceholder")}
              filters={[{ key: "state", label: t("status_"), options: [...new Set(referred.map(state))].map((k) => ({ value: k, label: t(`state_${k}`, { count: months }) })) }]}
              columns={[{ label: t("agency"), sort: "agency" }, { label: t("joinedOn"), sort: "joined" }, { label: t("firstPaid"), sort: "paid" }, { label: t("status_") }]}
              rows={referred.map((r) => ({
                id: r.id,
                text: r.agency.name,
                values: { agency: r.agency.name, joined: r.createdAt.getTime(), paid: r.firstPaidAt?.getTime() ?? null },
                facets: { state: state(r) },
                cells: [
                  <span key="n" className="font-medium">{r.agency.name}</span>,
                  eventDate(format, r.createdAt, "short"),
                  r.firstPaidAt ? eventDate(format, r.firstPaidAt, "short") : "—",
                  <Pill key="s" tone={tone[state(r)]}>{t(`state_${state(r)}`, { count: months })}</Pill>,
                ],
              }))}
            />
          )}
        </CardContent>
      </Card>
      {own && (
        <p className="text-sm text-muted-foreground">
          {own.affiliate ? t("youJoinedViaPartner", { name: own.affiliate.user.name }) : own.referringAgency ? t("youJoinedViaAgency", { name: own.referringAgency.name }) : null}
        </p>
      )}
    </div>
  );
}
