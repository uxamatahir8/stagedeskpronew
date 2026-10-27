import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma, tenantDb } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { requireViewer } from "@/lib/viewer";
import { AdminAnalytics } from "./admin-analytics";
import { AdminHome } from "./admin-home";
import { AdminInsights, ArtistInsights, BusinessInsights } from "./insights";
import { AffiliateHome } from "./affiliate-home";
import { AgencyAnalytics } from "./agency-analytics";
import { AgencyHome } from "./agency-home";
import { AgencyInsights } from "./agency-insights";
import { ArtistHome } from "./artist-home";
import { CustomerHome } from "./customer-home";
import { AffiliateAnalytics, ArtistAnalytics, CustomerProgress } from "./role-analytics";

export async function generateMetadata({ params }: PageProps<"/[locale]/app">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "nav" });
  return { title: t("home") };
}

export default async function DashboardHome({ params, searchParams }: PageProps<"/[locale]/app">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <RoleHome searchParams={searchParams} />
    </Suspense>
  );
}

/** Each role's home page, built from shared cards and charts. */
async function RoleHome({ searchParams }: Pick<PageProps<"/[locale]/app">, "searchParams">) {
  const [{ role, user, organization, permissions }, t, query] = await Promise.all([requireViewer(), getTranslations("home"), searchParams]);
  const firstName = user.name.split(/\s+/)[0] ?? user.name;
  const header = <PageHeader hero title={t("greeting", { name: firstName })} description={t(`subtitle.${role}`)} />;

  let body: React.ReactNode = null;
  if (organization && permissions.includes("agency.bookings")) {
    const db = tenantDb(organization.id);
    body = (
      <>
        <AgencyHome db={db} permissions={permissions} currency={organization.currency} attentionPage={positivePage(query["attentionPage"])} />
        <AgencyInsights organizationId={organization.id} db={db} permissions={permissions} currency={organization.currency} />
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <AgencyAnalytics organizationId={organization.id} permissions={permissions} currency={organization.currency} />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <BusinessInsights organizationId={organization.id} permissions={permissions} currency={organization.currency} solo={role === "solo_artist"} />
        </Suspense>
      </>
    );
  } else if (role === "platform_admin") {
    body = (
      <>
        <AdminHome />
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <AdminAnalytics />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <AdminInsights />
        </Suspense>
      </>
    );
  } else if (role === "artist") {
    body = (
      <>
        <ArtistHome userId={user.id} />
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <ArtistAnalytics userId={user.id} />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <ArtistInsights userId={user.id} />
        </Suspense>
      </>
    );
  } else if (role === "customer" && organization) {
    const db = tenantDb(organization.id);
    body = (
      <>
        <CustomerProgress db={db} userId={user.id} />
        <CustomerHome db={db} userId={user.id} agency={organization.name} />
      </>
    );
  } else if (role === "affiliate") {
    const affiliate = await prisma.affiliate.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (affiliate)
      body = (
        <>
          <AffiliateHome affiliateId={affiliate.id} />
          <Suspense fallback={<Skeleton className="h-96 w-full" />}>
            <AffiliateAnalytics affiliateId={affiliate.id} />
          </Suspense>
        </>
      );
  }

  return (
    <div className="grid gap-8">
      {header}
      {body}
    </div>
  );
}

function positivePage(value: string | string[] | undefined) {
  const page = Number(Array.isArray(value) ? value[0] : value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}
