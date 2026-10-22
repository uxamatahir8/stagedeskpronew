import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { appUrl } from "@/lib/mail";
import { requireAgency } from "@/lib/viewer";
import { BookingPageForm } from "./booking-page-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/booking-page">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "bookingPageSettings" });
  return { title: t("title") };
}

export default async function BookingPageSettings({ params }: PageProps<"/[locale]/app/booking-page">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  const { organization } = await requireAgency("agency.settings");
  const [t, locale] = await Promise.all([getTranslations("bookingPageSettings"), getLocale()]);
  const agency = await prisma.organization.findUniqueOrThrow({
    where: { id: organization.id },
    select: { slug: true, bookingPageEnabled: true, bookingIntro: true, coverUrl: true, showReviews: true, faq: true },
  });
  const faq = Array.isArray(agency.faq) ? (agency.faq as { question: string; answer: string }[]) : [];
  const prefix = locale === "en" ? "/en" : "";

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <BookingPageForm
        pageUrl={`${appUrl}${prefix}/b/${agency.slug}`}
        embedCode={`<script src="${appUrl}/embed.js" data-agency="${agency.slug}" data-lang="${locale}" async></script>`}
        values={{
          enabled: agency.bookingPageEnabled,
          intro: agency.bookingIntro ?? "",
          showReviews: agency.showReviews,
          coverUrl: agency.coverUrl,
          faq,
        }}
      />
    </div>
  );
}
