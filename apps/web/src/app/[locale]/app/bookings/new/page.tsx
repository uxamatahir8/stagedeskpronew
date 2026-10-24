import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { requireAgency } from "@/lib/viewer";
import { NewBookingForm } from "./new-booking-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/bookings/new">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "newBooking" });
  return { title: t("title") };
}

export default async function NewBookingPage({ params }: PageProps<"/[locale]/app/bookings/new">) {
  setRequestLocale((await params).locale as Locale);
  const t = await getTranslations("newBooking");
  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <Suspense fallback={<Skeleton className="h-[36rem] w-full" />}>
        <Form />
      </Suspense>
    </div>
  );
}

async function Form() {
  const { db } = await requireAgency("agency.bookings.create");
  const customers = await db.member.findMany({
    where: { role: "customer" },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { user: { name: "asc" } },
  });
  return <NewBookingForm customers={customers.map((c) => ({ id: c.user.id, name: c.user.name, email: c.user.email }))} />;
}
