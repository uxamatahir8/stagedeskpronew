import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma, tenantDb } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { requireViewer } from "@/lib/viewer";
import { AdminHome } from "./admin-home";
import { AffiliateHome } from "./affiliate-home";
import { AgencyHome } from "./agency-home";
import { AgencyInsights } from "./agency-insights";
import { ArtistHome } from "./artist-home";
import { CustomerHome } from "./customer-home";

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

/** Each role's home page, built from shared cards and charts. */
async function RoleHome() {
  const [{ role, user, organization, permissions }, t] = await Promise.all([requireViewer(), getTranslations("home")]);
  const firstName = user.name.split(/\s+/)[0] ?? user.name;
  const header = <PageHeader hero title={t("greeting", { name: firstName })} description={t(`subtitle.${role}`)} />;

  let body: React.ReactNode = null;
  if (organization && permissions.includes("agency.bookings")) {
    const db = tenantDb(organization.id);
    body = (
      <>
        <AgencyHome db={db} permissions={permissions} currency={organization.currency} />
        <AgencyInsights organizationId={organization.id} db={db} permissions={permissions} currency={organization.currency} />
      </>
    );
  } else if (role === "platform_admin") {
    body = <AdminHome />;
  } else if (role === "artist") {
    body = <ArtistHome userId={user.id} />;
  } else if (role === "customer" && organization) {
    body = <CustomerHome db={tenantDb(organization.id)} userId={user.id} agency={organization.name} />;
  } else if (role === "affiliate") {
    const affiliate = await prisma.affiliate.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (affiliate) body = <AffiliateHome affiliateId={affiliate.id} />;
  }

  return (
    <div className="grid gap-8">
      {header}
      {body}
    </div>
  );
}
