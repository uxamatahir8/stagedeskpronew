import { Suspense } from "react";
import { ActivityIcon, BellRingIcon } from "lucide-react";
import type { Metadata } from "next";
import type { Messages } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { can, type Role } from "@stagedesk/core";
import { tenantDb } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { requireViewer } from "@/lib/viewer";
import { AgencyHome } from "./agency-home";

type StatKey = keyof Messages["home"]["stats"];

// The four headline figures per role, from the plan's dashboard section.
const statsByRole: Record<Role, StatKey[]> = {
  platform_admin: ["mrr", "activeAgencies", "trialing", "platformFees"],
  agency_owner: ["newInquiries", "quotesExpiring", "eventsThisWeek", "collected"],
  agency_admin: ["newInquiries", "quotesExpiring", "eventsThisWeek", "collected"],
  agency_staff: ["newInquiries", "quotesExpiring", "eventsThisWeek", "collected"],
  artist: ["nextGig", "pendingRequests", "availableBalance", "paidThisYear"],
  customer: ["daysToGo", "amountPaid", "amountDue", "artistAssigned"],
  affiliate: ["clicks", "payingAgencies", "pendingCommission", "nextPayout"],
};

export async function generateMetadata({ params }: PageProps<"/[locale]/app">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "nav" });
  return { title: t("home") };
}

export default async function DashboardHome({ params }: PageProps<"/[locale]/app">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <RoleHome />
    </Suspense>
  );
}

async function RoleHome() {
  const [{ role, user, organization }, t] = await Promise.all([requireViewer(), getTranslations("home")]);
  const firstName = user.name.split(/\s+/)[0] ?? user.name;
  const header = <PageHeader title={t("greeting", { name: firstName })} description={t(`subtitle.${role}`)} />;

  if (organization && can(role, "agency.bookings")) {
    return (
      <div className="grid gap-8">
        {header}
        <AgencyHome db={tenantDb(organization.id)} role={role} />
      </div>
    );
  }

  // Other roles get their figures in phase 7 (dashboards).
  return (
    <div className="grid gap-8">
      {header}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statsByRole[role].map((key) => (
          <StatCard key={key} label={t(`stats.${key}`)} value="—" hint={t("noData")} />
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>{t("attentionTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState icon={BellRingIcon} title={t("attentionEmpty")} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("activityTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState icon={ActivityIcon} title={t("activityEmpty")} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
