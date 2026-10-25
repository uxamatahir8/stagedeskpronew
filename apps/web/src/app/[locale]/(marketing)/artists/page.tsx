import { MapPinIcon, SearchIcon, StarIcon, UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { eventTypes } from "@stagedesk/core";
import { directoryArtists } from "@stagedesk/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { euro } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";
import { SearchForm } from "@/components/search-form";

export async function generateMetadata({ params }: PageProps<"/[locale]/artists">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "artistDirectory" });
  return pageMetadata({ locale, title: t("metaTitle"), description: t("metaDescription"), paths: { nl: "/artists", en: "/artists" }, kicker: t("eyebrow") });
}

export default async function ArtistsPage({ params, searchParams }: PageProps<"/[locale]/artists">) {
  setRequestLocale((await params).locale as Locale);
  const t = await getTranslations("artistDirectory");
  return (
    <main className="mx-auto grid w-full max-w-[88rem] gap-10 px-5 py-14 sm:px-8 sm:py-20 lg:px-12">
      <header className="grid max-w-3xl gap-4">
        <p className="text-sm font-medium text-magenta">{t("eyebrow")}</p>
        <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">{t("title")}</h1>
        <p className="text-lg text-muted-foreground">{t("intro")}</p>
      </header>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Directory searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Directory({ searchParams }: Pick<PageProps<"/[locale]/artists">, "searchParams">) {
  // Who's listed depends on live subscriptions.
  await connection();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 96) : "");
  const filters = { q: one("q"), place: one("place"), eventType: (eventTypes as readonly string[]).includes(one("type")) ? one("type") : "" };
  const [t, te, format, artists] = await Promise.all([getTranslations("artistDirectory"), getTranslations("eventTypes"), getFormatter(), directoryArtists(filters)]);

  return (
    <div className="grid gap-8">
      <SearchForm className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end" role="search">
        <label className="grid gap-1.5 text-sm font-medium">
          {t("search")}
          <span className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input name="q" defaultValue={filters.q} placeholder={t("searchPlaceholder")} className="h-9 pl-8" />
          </span>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          {t("place")}
          <Input name="place" defaultValue={filters.place} placeholder="Utrecht" className="h-9" />
        </label>
        <div className="grid gap-1.5 text-sm font-medium">
          <span>{t("eventType")}</span>
          <NativeSelect name="type" defaultValue={filters.eventType} aria-label={t("eventType")} className="w-full">
            <option value="">{t("allEvents")}</option>
            {eventTypes.map((e) => (
              <option key={e} value={e}>
                {te(e)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit">{t("find")}</Button>
      </SearchForm>

      <p className="text-sm text-muted-foreground">{t("count", { count: artists.length })}</p>

      {artists.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-2xl border border-dashed p-12 text-center">
          <UsersIcon className="size-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">{t("emptyTitle")}</p>
          <p className="max-w-md text-sm text-muted-foreground">{t("emptyBody")}</p>
          <Button asChild variant="outline">
            <Link href="/request">{t("emptyCta")}</Link>
          </Button>
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {artists.map((a) => (
            <li key={a.id}>
              <Link href={`/artists/${a.slug}`} className="group grid overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                <div className="aspect-[4/3] overflow-hidden bg-muted">
                  {a.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- served from /files
                    <img src={a.photoUrl} alt="" className="size-full object-cover transition-transform group-hover:scale-[1.02]" loading="lazy" />
                  ) : (
                    <span className="flex size-full items-center justify-center text-5xl font-bold text-primary">{a.stageName.charAt(0)}</span>
                  )}
                </div>
                <div className="grid gap-2 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-lg font-semibold">{a.stageName}</span>
                    {a.rating && (
                      <span className="flex shrink-0 items-center gap-1 text-sm">
                        <StarIcon className="size-3.5 fill-warning text-warning" aria-hidden />
                        {format.number(a.rating.average, { maximumFractionDigits: 1 })}
                        <span className="text-muted-foreground">({a.rating.count})</span>
                      </span>
                    )}
                  </div>
                  {a.headline && <p className="line-clamp-2 text-sm text-muted-foreground">{a.headline}</p>}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-sm">
                    {a.city && (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <MapPinIcon className="size-3.5" aria-hidden />
                        {a.city}
                      </span>
                    )}
                    {a.priceFromCents && <span className="font-medium">{t("from", { price: euro(format, a.priceFromCents, a.currency) })}</span>}
                  </div>
                  {a.genres.length > 0 && (
                    <ul className="flex flex-wrap gap-1 pt-1">
                      {a.genres.slice(0, 4).map((g) => (
                        <li key={g}>
                          <Badge variant="secondary" className="font-normal">
                            {g}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
