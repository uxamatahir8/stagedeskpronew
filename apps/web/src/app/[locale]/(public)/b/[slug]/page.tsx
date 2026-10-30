import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { parseBookingTheme, todayInNetherlands } from "@stagedesk/core";
import { agencyBilling, agencyFullyBookedDates, publicAgency } from "@stagedesk/db";
import { InquiryForm } from "@/components/booking/inquiry-form";
import { BookingFrame, BookingPageView } from "@/components/booking-page/booking-page-view";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { bookingPageData } from "@/lib/booking-page";
import { appUrl } from "@/lib/mail";
import { jsonLd } from "@/lib/seo";
import { turnstileSiteKey } from "@/lib/turnstile";

export async function generateMetadata({ params }: PageProps<"/[locale]/b/[slug]">): Promise<Metadata> {
  const { slug, locale } = await params;
  // The database driver reads the clock, so metadata is computed per request too.
  await connection();
  const agency = await publicAgency(slug);
  if (!agency) return { robots: { index: false } };
  const t = await getTranslations({ locale: locale as Locale, namespace: "bookingPage" });
  const description = agency.bookingIntro?.slice(0, 160) ?? `${t("requestQuote")} – ${agency.name}`;
  const image = agency.coverUrl ?? agency.logo;
  return {
    title: { absolute: `${agency.name}${agency.city ? ` · ${agency.city}` : ""}` },
    description,
    alternates: { canonical: `/b/${slug}`, languages: { en: `/b/${slug}`, nl: `/nl/b/${slug}` } },
    openGraph: { title: agency.name, description, type: "website", images: image ? [`${appUrl}${image}`] : undefined },
  };
}

export default function BookingPage({ params }: PageProps<"/[locale]/b/[slug]">) {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-[80svh]" />}>
      <Page params={params} />
    </Suspense>
  );
}

async function Page({ params }: Pick<PageProps<"/[locale]/b/[slug]">, "params">) {
  const { slug, locale } = await params;
  setRequestLocale(locale as Locale);
  // Availability and reviews change all the time; render per request.
  await connection();
  const agency = await publicAgency(slug);
  if (!agency) notFound();
  // The booking page is a plan feature.
  if (!(await agencyBilling(agency.id)).limits.bookingPage) notFound();

  const today = todayInNetherlands();
  // Availability hints cover the next 18 months.
  const until = new Date(`${today}T00:00:00Z`);
  until.setUTCMonth(until.getUTCMonth() + 18);
  const [data, fullyBooked] = await Promise.all([bookingPageData(agency), agencyFullyBookedDates(agency.id, today, until.toISOString().slice(0, 10))]);
  const theme = parseBookingTheme(agency.bookingTheme);
  const rated = data.reviews && data.reviews.count > 0 && data.reviews.average;

  const structured = {
    "@type": "EntertainmentBusiness",
    name: agency.name,
    url: `${appUrl}/b/${slug}`,
    image: agency.coverUrl ?? agency.logo ? `${appUrl}${agency.coverUrl ?? agency.logo}` : undefined,
    telephone: agency.phone ?? undefined,
    email: agency.contactEmail ?? undefined,
    address: agency.city
      ? { "@type": "PostalAddress", streetAddress: agency.addressLine ?? undefined, postalCode: agency.postalCode ?? undefined, addressLocality: agency.city, addressCountry: "NL" }
      : undefined,
    aggregateRating: rated ? { "@type": "AggregateRating", ratingValue: data.reviews!.average!.toFixed(1), reviewCount: data.reviews!.count } : undefined,
  };

  return (
    <BookingFrame theme={theme} brandColor={agency.brandColor} className="min-h-svh">
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(structured)} />
      <BookingPageView
        data={data}
        theme={theme}
        form={
          <InquiryForm
            slug={slug}
            artists={data.artists.map((a) => ({ id: a.id, stageName: a.stageName }))}
            fullyBooked={fullyBooked}
            siteKey={turnstileSiteKey()}
            today={today}
          />
        }
      />
    </BookingFrame>
  );
}
