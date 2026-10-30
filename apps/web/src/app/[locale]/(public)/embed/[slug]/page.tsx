import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { parseBookingTheme, todayInNetherlands } from "@stagedesk/core";
import { agencyBilling, agencyFullyBookedDates, publicAgency, publicArtists } from "@stagedesk/db";
import { InquiryForm } from "@/components/booking/inquiry-form";
import type { Locale } from "@/i18n/routing";
import { BookingFrame } from "@/components/booking-page/booking-page-view";
import { turnstileSiteKey } from "@/lib/turnstile";
import { ReportHeight } from "./report-height";

export const metadata: Metadata = { robots: { index: false } };

/** Just the inquiry form, for agencies to place on their own website via /embed.js. */
export default function EmbedPage({ params }: PageProps<"/[locale]/embed/[slug]">) {
  return (
    <Suspense>
      <Embed params={params} />
    </Suspense>
  );
}

async function Embed({ params }: Pick<PageProps<"/[locale]/embed/[slug]">, "params">) {
  const { slug, locale } = await params;
  setRequestLocale(locale as Locale);
  await connection();
  const agency = await publicAgency(slug);
  if (!agency) notFound();
  // The embeddable form is a plan feature.
  if (!(await agencyBilling(agency.id)).limits.embedWidget) notFound();

  const today = todayInNetherlands();
  const until = new Date(`${today}T00:00:00Z`);
  until.setUTCMonth(until.getUTCMonth() + 18);
  const [artists, fullyBooked] = await Promise.all([
    publicArtists(agency.id),
    agencyFullyBookedDates(agency.id, today, until.toISOString().slice(0, 10)),
  ]);

  return (
    <BookingFrame theme={parseBookingTheme(agency.bookingTheme)} brandColor={agency.brandColor} className="p-4">
      <ReportHeight />
      <InquiryForm
        slug={slug}
        artists={artists.map((a) => ({ id: a.id, stageName: a.stageName }))}
        fullyBooked={fullyBooked}
        siteKey={turnstileSiteKey()}
        today={today}
      />
    </BookingFrame>
  );
}
