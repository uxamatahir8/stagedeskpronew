import { ArrowLeftIcon, ClockIcon, MapPinIcon, StarIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { type EventType, mediaEmbed, todayInNetherlands } from "@stagedesk/core";
import { artistProfile } from "@stagedesk/db";
import { InquiryForm } from "@/components/booking/inquiry-form";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { eventDate, euro } from "@/lib/format";
import { cn } from "@/lib/utils";
import { turnstileSiteKey } from "@/lib/turnstile";
import { requestArtistPriceAction } from "./actions";
import { OrderGigButton } from "./order-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/artists/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  await connection();
  const profile = await artistProfile(slug);
  if (!profile) return {};
  return { title: profile.stageName, description: profile.headline ?? profile.bio?.slice(0, 160) ?? undefined };
}

export default function ArtistPage({ params }: PageProps<"/[locale]/artists/[slug]">) {
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-12 px-5 py-12 sm:px-8 sm:py-16">
      <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
        <Profile params={params} />
      </Suspense>
    </main>
  );
}

async function Profile({ params }: Pick<PageProps<"/[locale]/artists/[slug]">, "params">) {
  // Listing depends on a live subscription, and the order form on today's date.
  await connection();
  const { slug, locale } = await params;
  setRequestLocale(locale as Locale);
  const [profile, t, te, format] = await Promise.all([artistProfile(slug), getTranslations("artistDirectory"), getTranslations("eventTypes"), getFormatter()]);
  if (!profile) notFound();
  const siteKey = turnstileSiteKey();
  const today = todayInNetherlands();

  return (
    <>
      <Link href="/artists" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" aria-hidden />
        {t("back")}
      </Link>

      <header className="grid gap-8 md:grid-cols-[18rem_minmax(0,1fr)] md:items-start">
        <div className="aspect-square overflow-hidden rounded-3xl border bg-muted">
          {profile.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- served from /files
            <img src={profile.photoUrl} alt={profile.stageName} className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-7xl font-bold text-primary">{profile.stageName.charAt(0)}</span>
          )}
        </div>
        <div className="grid content-start gap-4">
          <div className="grid gap-2">
            <h1 className="text-4xl font-bold tracking-tight text-balance">{profile.stageName}</h1>
            {profile.headline && <p className="text-lg text-muted-foreground">{profile.headline}</p>}
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {profile.city && (
              <li className="flex items-center gap-1.5">
                <MapPinIcon className="size-4" aria-hidden />
                {profile.regions.length ? t("plays", { places: [profile.city, ...profile.regions.filter((r) => r !== profile.city)].slice(0, 4).join(", ") }) : profile.city}
              </li>
            )}
            {profile.rating && (
              <li className="flex items-center gap-1.5">
                <StarIcon className="size-4 fill-warning text-warning" aria-hidden />
                {t("rating", { average: format.number(profile.rating.average, { maximumFractionDigits: 1 }), count: profile.rating.count })}
              </li>
            )}
            {profile.priceFromCents && <li className="font-medium text-foreground">{t("from", { price: euro(format, profile.priceFromCents, profile.currency) })}</li>}
          </ul>
          {profile.genres.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {profile.genres.map((g) => (
                <li key={g}>
                  <Badge variant="secondary">{g}</Badge>
                </li>
              ))}
            </ul>
          )}
          {profile.bio && <p className="max-w-prose whitespace-pre-line">{profile.bio}</p>}
        </div>
      </header>

      {profile.listings.length > 0 && (
        <section className="grid gap-4" aria-labelledby="gigs">
          <h2 id="gigs" className="text-2xl font-semibold tracking-tight">
            {t("gigsTitle")}
          </h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {profile.listings.map((l) => {
              const total = Math.round(l.priceCents * (1 + l.vatBps / 10_000));
              return (
                <li key={l.id} className="grid content-between gap-4 rounded-2xl border bg-card p-5">
                  <div className="grid gap-2">
                    <h3 className="text-lg font-semibold">{l.title}</h3>
                    <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      {l.durationMinutes && (
                        <span className="flex items-center gap-1">
                          <ClockIcon className="size-3.5" aria-hidden />
                          {t("hours", { hours: format.number(l.durationMinutes / 60, { maximumFractionDigits: 1 }) })}
                        </span>
                      )}
                      <span>{l.eventTypes ? l.eventTypes.map((e) => te(e as EventType)).join(", ") : t("allEvents")}</span>
                    </p>
                    {l.description && <p className="text-sm whitespace-pre-line text-muted-foreground">{l.description}</p>}
                  </div>
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div className="grid">
                      <span className="text-2xl font-bold tabular-nums">{euro(format, total, profile.currency)}</span>
                      <span className="text-xs text-muted-foreground">{t("inclVat")}</span>
                    </div>
                    <OrderGigButton slug={slug} listing={{ id: l.id, title: l.title, eventTypes: l.eventTypes }} priceLabel={euro(format, total, profile.currency)} siteKey={siteKey} today={today} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {profile.mediaLinks.length > 0 && (
        <section className="grid gap-4" aria-labelledby="media">
          <h2 id="media" className="text-2xl font-semibold tracking-tight">
            {t("mediaTitle")}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {profile.mediaLinks.map((link) => {
              const embed = mediaEmbed(link);
              if (!embed) return null;
              const audio = embed.provider === "soundcloud" || embed.provider === "mixcloud";
              return (
                <iframe
                  key={link}
                  src={embed.embedUrl}
                  title={`${profile.stageName} – ${t("listen")}`}
                  className={cn("w-full rounded-2xl border bg-black", audio ? "h-40" : "aspect-video")}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                />
              );
            })}
          </div>
        </section>
      )}

      {profile.reviews.length > 0 && (
        <section className="grid gap-4" aria-labelledby="reviews">
          <h2 id="reviews" className="text-2xl font-semibold tracking-tight">
            {t("reviewsTitle")}
          </h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {profile.reviews.map((r) => (
              <li key={r.id} className="grid gap-2 rounded-2xl border p-5">
                <span className="text-warning" aria-label={t("stars", { count: r.rating })}>
                  {"★".repeat(r.rating)}
                  <span className="text-muted-foreground/40">{"★".repeat(5 - r.rating)}</span>
                </span>
                {r.comment && <p className="text-sm">{r.comment}</p>}
                <span className="text-xs text-muted-foreground">
                  {r.customer.name.split(/\s+/)[0]} · {eventDate(format, r.createdAt, "short")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-6 rounded-3xl border bg-card p-6 shadow-sm sm:p-10" aria-labelledby="ask">
        <div className="grid gap-1">
          <h2 id="ask" className="text-2xl font-semibold tracking-tight">
            {t("askTitle", { name: profile.stageName })}
          </h2>
          <p className="text-muted-foreground">{t("askBody")}</p>
        </div>
        <InquiryForm slug={slug} artists={[]} fullyBooked={[]} siteKey={siteKey} today={today} submitAction={requestArtistPriceAction.bind(null, slug)} />
      </section>
    </>
  );
}
