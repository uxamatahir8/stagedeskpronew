import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { detailRequestByToken } from "@stagedesk/db";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { getFormatter } from "@/lib/formatter";
import { DetailsForm } from "./details-form";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function DetailsPage({ params }: PageProps<"/[locale]/d/[token]">) {
  return (
    <main className="mx-auto grid w-full max-w-2xl gap-6 px-4 py-10">
      <Suspense fallback={<Skeleton className="h-[36rem] w-full" />}>
        <Details params={params} />
      </Suspense>
    </main>
  );
}

/** The customer's private page to fill in their event details. Any link that doesn't work shows the same message. */
async function Details({ params }: Pick<PageProps<"/[locale]/d/[token]">, "params">) {
  const { token, locale } = await params;
  setRequestLocale(locale as Locale);
  // Expiry depends on the time.
  await connection();
  const [t, format, request] = await Promise.all([getTranslations("detailsPage"), getFormatter(), detailRequestByToken(token)]);
  if (!request) {
    return (
      <Card>
        <CardContent className="grid gap-2 py-8 text-center">
          <h1 className="text-xl font-semibold">{t("notAvailableTitle")}</h1>
          <p className="text-muted-foreground">{t("notAvailable")}</p>
        </CardContent>
      </Card>
    );
  }
  const f = request.fields;
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <p className="text-sm text-muted-foreground">{request.agency.name}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title", { name: request.customer.name.split(/\s+/)[0] ?? "" })}</h1>
        <p className="text-muted-foreground">{t("intro", { agency: request.agency.name, date: format.dateTime(request.expiresAt, { day: "numeric", month: "long", timeZone: "Europe/Amsterdam" }) })}</p>
      </div>
      <DetailsForm
        token={token}
        askPhone={!request.customer.hasPhone}
        initial={{
          eventType: String(f.eventType ?? "other"),
          eventDate: String(f.eventDate ?? ""),
          startTime: String(f.startTime ?? ""),
          endTime: String(f.endTime ?? ""),
          venueName: String(f.venueName ?? ""),
          venueAddress: String(f.venueAddress ?? ""),
          venueCity: String(f.venueCity ?? ""),
          guestCount: f.guestCount === null ? "" : String(f.guestCount),
          partnerName: String(f.partnerName ?? ""),
          preferredGenre: String(f.preferredGenre ?? ""),
          playlistUrl: String(f.playlistUrl ?? ""),
        }}
        contact={[request.agency.contactEmail, request.agency.phone].filter(Boolean).join(" · ")}
      />
    </div>
  );
}
