import { FileDownIcon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { type EventType } from "@stagedesk/core";
import { prisma } from "@stagedesk/db";
import { FormMessage } from "@/components/auth/auth-card";
import { PayPanel } from "@/components/booking/pay-panel";
import { QuoteTable } from "@/components/booking/quote-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { dateTime, euro, eventDate } from "@/lib/format";
import { payByQuoteTokenAction } from "@/lib/pay-actions";
import { AcceptQuoteForm } from "./accept-form";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function QuotePage({ params, searchParams }: PageProps<"/[locale]/q/[token]">) {
  return (
    <main className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-10">
      <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
        <Quote params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Quote({ params, searchParams }: Pick<PageProps<"/[locale]/q/[token]">, "params" | "searchParams">) {
  const { token, locale } = await params;
  setRequestLocale(locale as Locale);
  // Expiry depends on the current time, so this renders per request.
  await connection();
  const [t, format] = await Promise.all([getTranslations(), getFormatter()]);

  // The token is a long random secret; possessing it is what grants access.
  const quote = await prisma.quote.findUnique({
    where: { token },
    include: {
      items: { orderBy: { position: "asc" } },
      organization: { select: { name: true, logo: true, brandColor: true, contactEmail: true, phone: true, website: true } },
      booking: { select: { trackingCode: true, eventType: true, eventDate: true, venueName: true, venueCity: true, status: true, organizationId: true, totalCents: true, depositCents: true, paidCents: true, customer: { select: { name: true } } } },
    },
  });
  if (!quote) return <FormMessage>{t("quotePage.notFound")}</FormMessage>;

  const agency = quote.organization;
  const expired = quote.status === "sent" && quote.expiresAt <= new Date();
  const accent = agency.brandColor ?? undefined;

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-6" style={accent ? { borderColor: accent } : undefined}>
        <div className="flex items-center gap-3">
          {agency.logo && (
            // eslint-disable-next-line @next/next/no-img-element -- served from /files
            <img src={agency.logo} alt="" className="size-12 rounded-lg bg-white object-contain" />
          )}
          <div className="grid">
            <span className="text-lg font-semibold">{agency.name}</span>
            <span className="text-sm text-muted-foreground">{[agency.contactEmail, agency.phone].filter(Boolean).join(" · ")}</span>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href={`/api/pdf/quote/${quote.id}?token=${encodeURIComponent(token)}&lang=${locale}`} target="_blank" rel="noopener">
            <FileDownIcon />
            {t("quotePage.downloadPdf")}
          </a>
        </Button>
      </header>

      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("quotePage.title", { code: quote.booking.trackingCode })}</h1>
        <p className="text-muted-foreground">
          {quote.booking.customer && t("quotePage.for", { name: quote.booking.customer.name })} ·{" "}
          {t(`eventTypes.${quote.booking.eventType as EventType}`)}
          {quote.booking.eventDate && ` · ${eventDate(format, quote.booking.eventDate)}`}
          {quote.booking.venueCity && ` · ${[quote.booking.venueName, quote.booking.venueCity].filter(Boolean).join(", ")}`}
        </p>
        {quote.status === "sent" && !expired && (
          <p className="text-sm text-muted-foreground">{t("quotePage.validUntil", { date: dateTime(format, quote.expiresAt) })}</p>
        )}
      </div>

      <Card>
        <CardContent>
          <QuoteTable quote={quote} />
        </CardContent>
      </Card>

      {quote.status === "accepted" && quote.acceptedAt ? (
        <>
          <FormMessage tone="success">{t("quotePage.alreadyAccepted", { date: dateTime(format, quote.acceptedAt) })}</FormMessage>
          <PayPanel booking={quote.booking} pay={payByQuoteTokenAction.bind(null, token)} paid={(await searchParams)["paid"]} />
        </>
      ) : quote.status === "superseded" ? (
        <FormMessage>{t("quotePage.superseded")}</FormMessage>
      ) : quote.status !== "sent" || quote.booking.status !== "quoted" ? (
        <FormMessage>{t("quotePage.notOpen")}</FormMessage>
      ) : expired ? (
        <FormMessage>{t("bookingErrors.quote_expired")}</FormMessage>
      ) : (
        <Card>
          <CardContent className="grid gap-4">
            {quote.depositCents > 0 && <p className="text-sm">{t("quotePage.depositDue", { amount: euro(format, quote.depositCents) })}</p>}
            <AcceptQuoteForm token={token} defaultName={quote.booking.customer?.name ?? ""} />
          </CardContent>
        </Card>
      )}
    </>
  );
}
