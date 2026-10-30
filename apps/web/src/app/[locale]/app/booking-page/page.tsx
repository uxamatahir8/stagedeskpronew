import { localePrefix, parseBookingTheme } from "@stagedesk/core";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { bookingPageData } from "@/lib/booking-page";
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
  const { organization } = await requireAgency("agency.website");
  const [t, locale] = await Promise.all([getTranslations("bookingPageSettings"), getLocale()]);
  const agency = await prisma.organization.findUniqueOrThrow({
    where: { id: organization.id },
    select: {
      id: true,
      slug: true,
      name: true,
      logo: true,
      coverUrl: true,
      brandColor: true,
      bookingPageEnabled: true,
      bookingIntro: true,
      bookingTheme: true,
      faq: true,
      showReviews: true,
      city: true,
      addressLine: true,
      postalCode: true,
      phone: true,
      contactEmail: true,
      website: true,
    },
  });
  // Reviews are loaded even when hidden, so switching the section on shows them in the preview.
  const preview = await bookingPageData({ ...agency, showReviews: true });
  const theme = parseBookingTheme(agency.bookingTheme);
  // Agencies that hid reviews before sections existed keep them hidden.
  if (!agency.showReviews) theme.sections = theme.sections.map((s) => (s.key === "reviews" ? { ...s, visible: false } : s));
  const prefix = localePrefix(locale);

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      <BookingPageForm
        pageUrl={`${appUrl}${prefix}/b/${agency.slug}`}
        embedCode={`<script src="${appUrl}/embed.js" data-agency="${agency.slug}" data-lang="${locale}" async></script>`}
        preview={preview}
        values={{
          enabled: agency.bookingPageEnabled,
          intro: agency.bookingIntro ?? "",
          coverUrl: agency.coverUrl,
          faq: preview.faq,
          theme,
        }}
      />
    </div>
  );
}
