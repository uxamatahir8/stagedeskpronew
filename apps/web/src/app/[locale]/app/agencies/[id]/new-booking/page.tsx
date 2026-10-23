import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { prisma, tenantDb } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requirePermission } from "@/lib/viewer";
import { NewBookingForm } from "../../../bookings/new/new-booking-form";
import { createBookingForAgencyAction } from "../../actions";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/agencies/[id]/new-booking">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "agencyAdmin" });
  return { title: t("newBookingTitle") };
}

export default function NewAgencyBookingPage({ params }: PageProps<"/[locale]/app/agencies/[id]/new-booking">) {
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
      <NewAgencyBooking params={params} />
    </Suspense>
  );
}

async function NewAgencyBooking({ params }: Pick<PageProps<"/[locale]/app/agencies/[id]/new-booking">, "params">) {
  const { locale, id } = await params;
  setRequestLocale(locale as Locale);
  await requirePermission("platform.agencies");
  const agency = await prisma.organization.findUnique({ where: { id }, select: { id: true, name: true, suspendedAt: true } });
  if (!agency) notFound();
  const t = await getTranslations("agencyAdmin");
  // Platform admins pick from this agency's customers only: the view is scoped to it.
  const customers = await tenantDb(agency.id).member.findMany({
    where: { role: "customer" },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: "asc" } },
  });

  return (
    <div className="grid max-w-3xl gap-6">
      <Link href={`/app/agencies/${agency.id}`} className="flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" aria-hidden />
        {agency.name}
      </Link>
      <PageHeader title={t("newBookingTitle")} description={t("newBookingHint", { agency: agency.name })} />
      <NewBookingForm
        customers={customers.map((c) => ({ id: c.user.id, name: c.user.name, email: c.user.email }))}
        submitAction={createBookingForAgencyAction.bind(null, agency.id)}
        extra={
          <Card>
            <CardContent className="flex items-center justify-between gap-4">
              <label htmlFor="nb-notify" className="grid gap-0.5 text-sm">
                <span className="font-medium">{t("notifyCustomer")}</span>
                <span className="text-muted-foreground">{t("notifyCustomerHint")}</span>
              </label>
              <Switch id="nb-notify" name="notifyCustomer" defaultChecked />
            </CardContent>
          </Card>
        }
      />
    </div>
  );
}
