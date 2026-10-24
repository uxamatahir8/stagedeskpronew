import { SparklesIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { agencyLeadOffers } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { eventDate } from "@/lib/format";
import { requireAgency } from "@/lib/viewer";
import { OfferButtons } from "./offer-buttons";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/lead-offers">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "leadOffers" });
  return { title: t("title") };
}

export default async function LeadOffersPage({ params }: PageProps<"/[locale]/app/lead-offers">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Offers />
    </Suspense>
  );
}

async function Offers() {
  const { organization } = await requireAgency("agency.leads");
  const [t, te, tb, format, offers] = await Promise.all([
    getTranslations("leadOffers"),
    getTranslations("eventTypes"),
    getTranslations("budgetRanges"),
    getFormatter(),
    // Only this agency's own offers; contact details stay hidden until it accepts.
    agencyLeadOffers(organization.id),
  ]);

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      {offers.length === 0 ? (
        <EmptyState icon={SparklesIcon} title={t("empty")} description={t("emptyHint")} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {offers.map((o) => (
            <Card key={o.id}>
              <CardHeader>
                <CardTitle>
                  {te(o.eventType as "wedding")} · {eventDate(format, o.eventDate, "short")}
                </CardTitle>
                <CardDescription>
                  {o.reference} · {t("offeredOn", { date: format.dateTime(o.offeredAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) })}
                  {o.offeredTo > 1 ? ` · ${t("competing", { count: o.offeredTo })}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">{t("city")}</dt>
                  <dd className="font-medium">{o.venueCity ?? "—"}</dd>
                  <dt className="text-muted-foreground">{t("time")}</dt>
                  <dd className="font-medium">{o.startTime ?? "—"}</dd>
                  <dt className="text-muted-foreground">{t("guests")}</dt>
                  <dd className="font-medium">{o.guestCount ?? "—"}</dd>
                  <dt className="text-muted-foreground">{t("budget")}</dt>
                  <dd className="font-medium">{o.budgetRange ? tb(o.budgetRange as "lt_750") : "—"}</dd>
                  {o.preferredGenre && (
                    <>
                      <dt className="text-muted-foreground">{t("genre")}</dt>
                      <dd className="font-medium">{o.preferredGenre}</dd>
                    </>
                  )}
                </dl>
                {o.message && <p className="rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-line">{o.message}</p>}
                <p className="text-xs text-muted-foreground">{t("contactHidden")}</p>
                <OfferButtons leadId={o.id} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
