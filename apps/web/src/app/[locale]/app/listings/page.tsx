import { ExternalLinkIcon, TicketIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import type { EventType } from "@stagedesk/core";
import { artistProfile, getSetting, prisma } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { centsToInput, euro, percent } from "@/lib/format";
import { getFormatter } from "@/lib/formatter";
import { requireAgency } from "@/lib/viewer";
import { DeleteListingButton, ListingDialog } from "./listing-dialog";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/listings">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "listings" });
  return { title: t("title") };
}

export default async function ListingsPage({ params }: PageProps<"/[locale]/app/listings">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Listings />
    </Suspense>
  );
}

async function Listings() {
  const { organization } = await requireAgency("solo.listings");
  const [t, te, format, locale, listings, defaults, org] = await Promise.all([
    getTranslations("listings"),
    getTranslations("eventTypes"),
    getFormatter(),
    getLocale(),
    prisma.gigListing.findMany({ where: { organizationId: organization.id }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], include: { _count: { select: { bookings: true } } } }),
    getSetting("bookings.defaults"),
    prisma.organization.findUniqueOrThrow({ where: { id: organization.id }, select: { slug: true, currency: true } }),
  ]);
  const listed = Boolean(await artistProfile(org.slug));
  const dialog = { vatRates: defaults.vatRatesBps, defaultDepositBps: defaults.depositBps, currency: org.currency };

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} actions={<ListingDialog {...dialog} />} />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-4 text-sm">
        <span>{listed ? t("listedHint") : t("notListedHint")}</span>
        {listed ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/artists/${org.slug}`} target="_blank">
              <ExternalLinkIcon />
              {t("viewProfile")}
            </Link>
          </Button>
        ) : (
          <Button asChild size="sm">
            <Link href="/app/billing">{t("getPlan")}</Link>
          </Button>
        )}
      </div>
      {listings.length === 0 ? (
        <EmptyState icon={TicketIcon} title={t("empty")} description={t("emptyHint")} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {listings.map((l) => {
            const types = Array.isArray(l.eventTypes) ? (l.eventTypes as EventType[]) : null;
            return (
              <Card key={l.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <div className="grid gap-1">
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      {l.title}
                      {!l.active && <Pill>{t("inactive")}</Pill>}
                    </CardTitle>
                    <CardDescription>
                      {types ? types.map((x) => te(x)).join(", ") : t("allTypes")}
                      {l.durationMinutes ? ` · ${t("hoursShort", { hours: format.number(l.durationMinutes / 60, { maximumFractionDigits: 1 }) })}` : ""}
                    </CardDescription>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <ListingDialog
                      {...dialog}
                      listing={{
                        id: l.id,
                        title: l.title,
                        description: l.description ?? "",
                        price: centsToInput(l.priceCents, locale),
                        vatBps: l.vatBps,
                        depositPct: l.depositBps / 100,
                        hours: l.durationMinutes ? String(l.durationMinutes / 60) : "",
                        eventTypes: types,
                        active: l.active,
                      }}
                    />
                    <DeleteListingButton id={l.id} />
                  </div>
                </CardHeader>
                <CardContent className="grid gap-3">
                  {l.description && <p className="line-clamp-3 text-sm text-muted-foreground">{l.description}</p>}
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-xl font-semibold tabular-nums">{euro(format, l.priceCents, org.currency)}</span>
                    <span className="text-xs text-muted-foreground">
                      {t("priceMeta", { vat: percent(format, l.vatBps), deposit: percent(format, l.depositBps) })} · {t("orders", { count: l._count.bookings })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
