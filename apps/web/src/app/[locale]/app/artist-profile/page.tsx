import { CheckCircle2Icon, CircleIcon, PartyPopperIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { prisma, soloArtist } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { centsToInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requireAgency } from "@/lib/viewer";
import { ServiceAreaForm } from "../agency-settings/service-area-form";
import { SoloProfileForm } from "./profile-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/artist-profile">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "artistProfile" });
  return { title: t("title") };
}

export default async function ArtistProfilePage({ params, searchParams }: PageProps<"/[locale]/app/artist-profile">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
      <Profile searchParams={searchParams} />
    </Suspense>
  );
}

async function Profile({ searchParams }: Pick<PageProps<"/[locale]/app/artist-profile">, "searchParams">) {
  const { organization } = await requireAgency("artist.profile");
  const [t, locale, sp, artist, org, connected, listings, unavailable] = await Promise.all([
    getTranslations("artistProfile"),
    getLocale(),
    searchParams,
    soloArtist(organization.id),
    prisma.organization.findUniqueOrThrow({ where: { id: organization.id } }),
    prisma.connectedAccount.count({ where: { organizationId: organization.id, artistId: null, chargesEnabled: true } }),
    prisma.gigListing.count({ where: { organizationId: organization.id, active: true } }),
    prisma.artistUnavailability.count({ where: { organizationId: organization.id } }),
  ]);
  if (!artist) return <p className="text-muted-foreground">{t("notSolo")}</p>;

  const regions = Array.isArray(org.serviceRegions) ? (org.serviceRegions as string[]) : [];
  const steps = [
    { key: "photo", done: Boolean(artist.photoUrl), href: "/app/artist-profile" },
    { key: "bio", done: Boolean(artist.bio && artist.headline), href: "/app/artist-profile" },
    { key: "area", done: regions.length > 0 || Boolean(org.serviceRadiusKm), href: "/app/artist-profile" },
    { key: "availability", done: unavailable > 0, href: "/app/availability" },
    { key: "payouts", done: connected > 0, href: "/app/payments" },
    { key: "listings", done: listings > 0, href: "/app/listings" },
  ] as const;
  const done = steps.filter((s) => s.done).length;

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      {sp["welcome"] === "1" && (
        <div className="flex gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <PartyPopperIcon className="size-5 shrink-0 text-primary" aria-hidden />
          <p>{t("welcome")}</p>
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t("checklist")}</CardTitle>
          <CardDescription>{t("checklistHint", { done, total: steps.length })}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-success" style={{ width: `${(done / steps.length) * 100}%` }} />
          </div>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {steps.map((s) => (
              <li key={s.key} className={cn("flex items-center gap-2", s.done && "text-muted-foreground")}>
                {s.done ? <CheckCircle2Icon className="size-4 text-success" aria-hidden /> : <CircleIcon className="size-4" aria-hidden />}
                {s.done ? (
                  <span>{t(`step_${s.key}`)}</span>
                ) : (
                  <Link href={s.href} className="font-medium underline-offset-4 hover:underline">
                    {t(`step_${s.key}`)}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <SoloProfileForm
        currency={org.currency}
        initial={{
          stageName: artist.stageName,
          headline: artist.headline ?? "",
          bio: artist.bio ?? "",
          genres: Array.isArray(artist.genres) ? (artist.genres as string[]).join(", ") : "",
          mediaLinks: Array.isArray(artist.mediaLinks) ? (artist.mediaLinks as string[]).join("\n") : "",
          priceFrom: artist.priceFromCents ? centsToInput(artist.priceFromCents, locale) : "",
          photoUrl: artist.photoUrl,
        }}
      />
      <ServiceAreaForm
        initial={{
          acceptsLeads: org.acceptsLeads,
          regions,
          radiusKm: org.serviceRadiusKm ? String(org.serviceRadiusKm) : "",
          eventTypes: Array.isArray(org.serviceEventTypes) ? (org.serviceEventTypes as string[]) : null,
          located: org.latitude !== null ? [org.addressLine, org.city].filter(Boolean).join(", ") || org.city : null,
          ownCity: org.city,
        }}
      />
    </div>
  );
}
