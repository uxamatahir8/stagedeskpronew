import { ArrowDownIcon, GlobeIcon, MailIcon, MapPinIcon, PhoneIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { mediaEmbed, todayInNetherlands } from "@stagedesk/core";
import { agencyFullyBookedDates, approvedReviews, publicAgency, publicArtists } from "@stagedesk/db";
import { ArtistAvatar } from "@/components/artist-avatar";
import { InquiryForm } from "@/components/booking/inquiry-form";
import { Stars } from "@/components/stars";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { brandStyle } from "@/lib/brand";
import { appUrl } from "@/lib/mail";
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
    alternates: { canonical: `/b/${slug}`, languages: { nl: `/b/${slug}`, en: `/en/b/${slug}` } },
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

const asList = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

async function Page({ params }: Pick<PageProps<"/[locale]/b/[slug]">, "params">) {
  const { slug, locale } = await params;
  setRequestLocale(locale as Locale);
  // Availability and reviews change all the time; render per request.
  await connection();
  const agency = await publicAgency(slug);
  if (!agency) notFound();

  const today = todayInNetherlands();
  // Availability hints cover the next 18 months.
  const until = new Date(`${today}T00:00:00Z`);
  until.setUTCMonth(until.getUTCMonth() + 18);
  const [t, format, artists, reviews, fullyBooked] = await Promise.all([
    getTranslations(),
    getFormatter(),
    publicArtists(agency.id),
    agency.showReviews ? approvedReviews(agency.id) : Promise.resolve(null),
    agencyFullyBookedDates(agency.id, today, until.toISOString().slice(0, 10)),
  ]);
  const faq = asList<{ question: string; answer: string }>(agency.faq).filter((f) => f.question && f.answer);
  const showReviews = reviews && reviews.count > 0;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "EntertainmentBusiness",
    name: agency.name,
    url: `${appUrl}/b/${slug}`,
    image: agency.coverUrl ?? agency.logo ? `${appUrl}${agency.coverUrl ?? agency.logo}` : undefined,
    telephone: agency.phone ?? undefined,
    email: agency.contactEmail ?? undefined,
    address: agency.city
      ? { "@type": "PostalAddress", streetAddress: agency.addressLine ?? undefined, postalCode: agency.postalCode ?? undefined, addressLocality: agency.city, addressCountry: "NL" }
      : undefined,
    aggregateRating:
      showReviews && reviews.average
        ? { "@type": "AggregateRating", ratingValue: reviews.average.toFixed(1), reviewCount: reviews.count }
        : undefined,
  };

  return (
    <div style={brandStyle(agency.brandColor)} className="min-h-svh bg-background">
      <script
        type="application/ld+json"
        // JSON.stringify output with "<" escaped can't break out of the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <header className="relative isolate overflow-hidden bg-primary text-primary-foreground">
        {agency.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- served from /files
          <img src={agency.coverUrl} alt="" className="absolute inset-0 -z-10 size-full object-cover opacity-35" />
        )}
        <div className="mx-auto grid max-w-5xl gap-6 px-4 py-16 sm:py-24">
          <div className="flex items-center gap-4">
            {agency.logo && (
              // eslint-disable-next-line @next/next/no-img-element -- served from /files
              <img src={agency.logo} alt="" className="size-16 rounded-2xl bg-white object-contain p-1 shadow" />
            )}
            <div className="grid gap-1">
              <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">{agency.name}</h1>
              {agency.city && (
                <p className="flex items-center gap-1.5 opacity-90">
                  <MapPinIcon className="size-4" aria-hidden />
                  {agency.city}
                </p>
              )}
            </div>
          </div>
          {showReviews && reviews.average && (
            <p className="flex flex-wrap items-center gap-2">
              <Stars rating={Math.round(reviews.average)} />
              <span className="opacity-90">{t("bookingPage.rating", { rating: format.number(reviews.average, { maximumFractionDigits: 1 }), count: reviews.count })}</span>
            </p>
          )}
          <div>
            <Button asChild size="lg" variant="secondary">
              <a href="#aanvraag">
                {t("bookingPage.requestQuote")}
                <ArrowDownIcon />
              </a>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-16 px-4 py-14">
        {agency.bookingIntro && <p className="max-w-prose text-lg leading-relaxed whitespace-pre-line">{agency.bookingIntro}</p>}

        {artists.length > 0 && (
          <section className="grid gap-6" aria-labelledby="artists-heading">
            <h2 id="artists-heading" className="text-2xl font-semibold tracking-tight">
              {t("bookingPage.ourArtists")}
            </h2>
            <ul className="grid gap-6 sm:grid-cols-2">
              {artists.map((a) => {
                const media = asList<string>(a.mediaLinks).map(mediaEmbed).filter((m) => m !== null).slice(0, 1);
                const genres = asList<string>(a.genres);
                return (
                  <li key={a.id} className="grid content-start gap-4 rounded-2xl border bg-card p-5">
                    <div className="flex items-center gap-4">
                      <ArtistAvatar name={a.stageName} photoUrl={a.photoUrl} size="lg" />
                      <div className="grid gap-1">
                        <h3 className="text-lg font-semibold">{a.stageName}</h3>
                        {genres.length > 0 && <p className="text-sm text-muted-foreground">{genres.join(" · ")}</p>}
                      </div>
                    </div>
                    {a.bio && <p className="line-clamp-4 text-sm text-muted-foreground">{a.bio}</p>}
                    {media.map((m) => (
                      <iframe
                        key={m.embedUrl}
                        src={m.embedUrl}
                        title={`${a.stageName} – ${t("bookingPage.listen")}`}
                        loading="lazy"
                        allow="encrypted-media; picture-in-picture"
                        referrerPolicy="strict-origin-when-cross-origin"
                        sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
                        className={m.provider === "youtube" || m.provider === "vimeo" ? "aspect-video w-full rounded-xl" : "h-32 w-full rounded-xl"}
                      />
                    ))}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {showReviews && (
          <section className="grid gap-6" aria-labelledby="reviews-heading">
            <h2 id="reviews-heading" className="text-2xl font-semibold tracking-tight">
              {t("bookingPage.reviews")}
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {reviews.reviews.map((r) => (
                <li key={r.id} className="grid content-start gap-3 rounded-2xl border bg-card p-5">
                  <Stars rating={r.rating} />
                  {r.comment && <p className="text-sm">“{r.comment}”</p>}
                  <p className="text-sm text-muted-foreground">
                    {r.customer.name.split(" ")[0]}
                    {r.artist && ` · ${r.artist.stageName}`}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section id="aanvraag" className="grid scroll-mt-6 gap-6 rounded-3xl border bg-card p-6 sm:p-10" aria-labelledby="form-heading">
          <div className="grid gap-1">
            <h2 id="form-heading" className="text-2xl font-semibold tracking-tight">
              {t("bookingPage.formTitle")}
            </h2>
            <p className="text-muted-foreground">{t("bookingPage.formIntro")}</p>
          </div>
          <InquiryForm
            slug={slug}
            artists={artists.map((a) => ({ id: a.id, stageName: a.stageName }))}
            fullyBooked={fullyBooked}
            siteKey={turnstileSiteKey()}
            today={today}
          />
        </section>

        {faq.length > 0 && (
          <section className="grid gap-4" aria-labelledby="faq-heading">
            <h2 id="faq-heading" className="text-2xl font-semibold tracking-tight">
              {t("bookingPage.faq")}
            </h2>
            <div className="divide-y rounded-2xl border bg-card">
              {faq.map((f) => (
                <details key={f.question} className="group p-5">
                  <summary className="cursor-pointer list-none font-medium marker:hidden">{f.question}</summary>
                  <p className="mt-2 text-sm whitespace-pre-line text-muted-foreground">{f.answer}</p>
                </details>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {agency.phone && (
              <a href={`tel:${agency.phone.replace(/\s/g, "")}`} className="flex items-center gap-1.5 hover:text-foreground">
                <PhoneIcon className="size-4" aria-hidden />
                {agency.phone}
              </a>
            )}
            {agency.contactEmail && (
              <a href={`mailto:${agency.contactEmail}`} className="flex items-center gap-1.5 hover:text-foreground">
                <MailIcon className="size-4" aria-hidden />
                {agency.contactEmail}
              </a>
            )}
            {agency.website && (
              <a href={agency.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-foreground">
                <GlobeIcon className="size-4" aria-hidden />
                {agency.website.replace(/^https?:\/\//, "")}
              </a>
            )}
          </div>
          <Link href="/" className="hover:text-foreground">
            {t("bookingPage.poweredBy")}
          </Link>
        </div>
      </footer>
    </div>
  );
}
