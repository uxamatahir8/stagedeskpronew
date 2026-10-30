import { ArrowRightIcon, CheckIcon, GlobeIcon, MailIcon, MapPinIcon, PhoneIcon, PlusIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { BookingSection, BookingTheme, mediaEmbed } from "@stagedesk/core";
import { readableOn } from "@/components/sites/site-sections";
import { siteFontClass } from "@/components/sites/fonts";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { ArtistBrowser } from "./artist-browser";
import { accentTint, FORM_ANCHOR, sectionHeadingKey } from "./shared";

/**
 * The public booking page as pure rendering: the live page at /b/<slug> and
 * the live preview in the booking page settings both use it. Sizes follow the
 * container (`@3xl:` etc.), so the phone preview matches a real phone. The
 * inquiry form comes in as `form`, so the preview can show a stand-in.
 */

export interface BookingArtist {
  id: string;
  stageName: string;
  photoUrl: string | null;
  genres: string[];
  bio: string | null;
  media: NonNullable<ReturnType<typeof mediaEmbed>> | null;
}

export interface BookingReview {
  id: string;
  rating: number;
  comment: string | null;
  author: string;
  artist: string | null;
}

export interface BookingPageData {
  name: string;
  logo: string | null;
  coverUrl: string | null;
  brandColor: string | null;
  intro: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  contactEmail: string | null;
  website: string | null;
  faq: { question: string; answer: string }[];
  artists: BookingArtist[];
  /** null when the agency hides reviews. */
  reviews: { average: number | null; count: number; items: BookingReview[] } | null;
}

const fallbackAccent = "#572261";
const radii = { sharp: ["0.25rem", "0.375rem"], soft: ["0.75rem", "1.25rem"], round: ["1.25rem", "2rem"] } as const;

/** Colours, type, corners and light/dark for everything inside. Dialogs mount here too, so they share the look. */
export function BookingFrame({ theme, brandColor, className, children }: { theme: BookingTheme; brandColor: string | null; className?: string; children: React.ReactNode }) {
  const accent = theme.accent || (brandColor && /^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : fallbackAccent);
  const [radius, radiusLg] = radii[theme.radius];
  const style = {
    "--bp-accent": accent,
    "--bp-on-accent": readableOn(accent),
    "--bp-radius": radius,
    "--bp-radius-lg": radiusLg,
    // The inquiry form uses StageDesk's form components; give them the agency's look.
    "--primary": accent,
    "--primary-foreground": readableOn(accent),
    "--ring": accent,
    "--radius": radius,
    fontFamily: "var(--site-font), ui-sans-serif, system-ui, sans-serif",
  } as React.CSSProperties;
  return (
    <div data-bp-frame style={style} className={cn(siteFontClass[theme.font], theme.mode, "bg-background text-foreground antialiased", className)}>
      {children}
    </div>
  );
}

const accentButton =
  "inline-flex items-center justify-center gap-2 rounded-[var(--bp-radius)] bg-[var(--bp-accent)] px-5 py-3 text-sm font-semibold text-[var(--bp-on-accent)] shadow-sm transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--bp-accent)]";

export function BookingPageView({ data, theme, form, preview = false }: { data: BookingPageData; theme: BookingTheme; form: React.ReactNode; preview?: boolean }) {
  const t = useTranslations("bookingPage");
  const sections = theme.sections.filter((s) => s.visible && hasContent(s, data));
  const ctaLabel = theme.ctaLabel || t("requestQuote");
  const nav = sections.filter((s) => s.key === "artists" || s.key === "reviews" || s.key === "faq");

  return (
    <div className="@container relative">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-3">
          {data.logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- served from /files
            <img src={data.logo} alt="" className="size-9 rounded-[var(--bp-radius)] bg-white object-contain p-0.5 ring-1 ring-border" />
          ) : (
            <span className={cn("flex size-9 items-center justify-center rounded-[var(--bp-radius)] text-sm font-bold text-[var(--bp-accent)]", accentTint)}>
              {data.name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="min-w-0 truncate font-semibold tracking-tight">{data.name}</span>
          <nav className="ml-auto hidden items-center gap-6 text-sm text-muted-foreground @3xl:flex" aria-label={data.name}>
            {nav.map((s) => (
              <a key={s.key} href={`#${s.key}`} className="transition-colors hover:text-foreground">
                {s.heading || t(sectionHeadingKey[s.key])}
              </a>
            ))}
          </nav>
          <a href={`#${FORM_ANCHOR}`} className={cn(accentButton, "ml-auto px-4 py-2 @3xl:ml-2")}>
            {ctaLabel}
          </a>
        </div>
      </header>

      <Hero data={data} theme={theme} ctaLabel={ctaLabel} />
      {theme.showStats && <Stats data={data} />}

      <main className="mx-auto grid max-w-6xl gap-24 px-5 py-20 @3xl:gap-32 @3xl:py-28">
        {sections.map((s) => (
          <Section key={s.key} section={s} data={data} theme={theme} form={form} preview={preview} />
        ))}
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-sm text-muted-foreground">
          <span>
            © {data.name}
            {data.city && ` · ${data.city}`}
          </span>
          <Link href="/" className="transition-colors hover:text-foreground">
            {t("poweredBy")}
          </Link>
        </div>
      </footer>

      {/* Always within reach on phones. */}
      <div className="pointer-events-none sticky bottom-0 z-20 px-4 pb-4 @3xl:hidden">
        <a href={`#${FORM_ANCHOR}`} className={cn(accentButton, "pointer-events-auto w-full py-3.5 shadow-lg")}>
          {ctaLabel}
          <ArrowRightIcon className="size-4" aria-hidden />
        </a>
      </div>
    </div>
  );
}

function hasContent(section: BookingSection, data: BookingPageData) {
  switch (section.key) {
    case "intro":
      return data.intro.trim() !== "";
    case "artists":
      return data.artists.length > 0;
    case "reviews":
      return !!data.reviews && data.reviews.count > 0;
    case "faq":
      return data.faq.length > 0;
    case "contact":
      return !!(data.phone || data.contactEmail || data.website || data.address);
    default:
      return true;
  }
}

function Hero({ data, theme, ctaLabel }: { data: BookingPageData; theme: BookingTheme; ctaLabel: string }) {
  const t = useTranslations("bookingPage");
  const format = useFormatter();
  const headline = theme.headline || data.name;
  const eyebrow = theme.headline ? data.name : data.city;
  const rating =
    data.reviews?.average && data.reviews.count > 0 ? (
      <span className="inline-flex items-center gap-2 text-sm">
        <StarRow rating={data.reviews.average} />
        <span className="opacity-80">{t("rating", { rating: format.number(data.reviews.average, { maximumFractionDigits: 1 }), count: data.reviews.count })}</span>
      </span>
    ) : null;
  const actions = (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
      <a href={`#${FORM_ANCHOR}`} className={cn(accentButton, "px-6 py-3.5 text-base")}>
        {ctaLabel}
        <ArrowRightIcon className="size-4" aria-hidden />
      </a>
      {rating}
    </div>
  );
  const text = (onImage: boolean, align: "left" | "center" = "left") => (
    <div className={cn("grid gap-5", align === "center" && "justify-items-center text-center")}>
      {eyebrow && (
        <p className={cn("flex items-center gap-2 text-sm font-medium tracking-wide uppercase", onImage ? "opacity-85" : "text-muted-foreground")}>
          <span className="size-1.5 rounded-full bg-[var(--bp-accent)]" aria-hidden />
          {eyebrow}
        </p>
      )}
      <h1 className="max-w-4xl text-4xl leading-[1.04] font-semibold tracking-tight text-balance @xl:text-5xl @5xl:text-7xl">{headline}</h1>
      {theme.tagline && <p className={cn("max-w-2xl text-lg leading-relaxed text-pretty @3xl:text-xl", onImage ? "opacity-85" : "text-muted-foreground")}>{theme.tagline}</p>}
      <div className="pt-2">{actions}</div>
    </div>
  );

  if (theme.hero === "minimal") {
    return (
      <section className="relative isolate overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-x-0 -top-40 -z-10 mx-auto h-96 max-w-3xl rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(closest-side, var(--bp-accent), transparent)" }}
        />
        <div className="mx-auto max-w-6xl px-5 py-24 @3xl:py-36">{text(false, "center")}</div>
      </section>
    );
  }

  if (theme.hero === "split") {
    return (
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-14 @3xl:grid-cols-[1.1fr_1fr] @3xl:py-24">
        {text(false)}
        <CoverImage data={data} className="aspect-[4/5] rounded-[var(--bp-radius-lg)] @3xl:aspect-[4/5]" />
      </section>
    );
  }

  if (theme.hero === "banner") {
    return (
      <section>
        <CoverImage data={data} className="h-56 @3xl:h-96" />
        <div className="mx-auto max-w-6xl px-5">
          <div className="-mt-12 grid gap-6 rounded-[var(--bp-radius-lg)] border bg-card p-6 shadow-xl shadow-black/5 @3xl:-mt-20 @3xl:p-12">{text(false)}</div>
        </div>
      </section>
    );
  }

  // Full-bleed cover, text over the photo; the accent colour stands in when there is no photo.
  const shade = theme.overlay / 100;
  return (
    <section className="relative isolate flex min-h-[32rem] items-end overflow-hidden text-white @3xl:min-h-[40rem]">
      {data.coverUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- served from /files */}
          <img src={data.coverUrl} alt="" className="absolute inset-0 -z-20 size-full object-cover" />
          <div
            aria-hidden
            className="absolute inset-0 -z-10"
            style={{ background: `linear-gradient(to top, rgb(0 0 0 / ${Math.min(0.95, shade + 0.25)}), rgb(0 0 0 / ${shade * 0.6}) 55%, rgb(0 0 0 / ${shade * 0.25}))` }}
          />
        </>
      ) : (
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(90% 80% at 85% 0%, color-mix(in oklab, var(--bp-accent), white 25%), transparent 60%), linear-gradient(160deg, var(--bp-accent), color-mix(in oklab, var(--bp-accent), black 55%))",
          }}
        />
      )}
      <div className="mx-auto w-full max-w-6xl px-5 pt-32 pb-14 @3xl:pb-20">{text(true)}</div>
    </section>
  );
}

function CoverImage({ data, className }: { data: BookingPageData; className?: string }) {
  return data.coverUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- served from /files
    <img src={data.coverUrl} alt="" className={cn("w-full object-cover", className)} />
  ) : (
    <div
      aria-hidden
      className={cn("w-full", className)}
      style={{
        background:
          "radial-gradient(70% 70% at 80% 10%, color-mix(in oklab, var(--bp-accent), white 30%), transparent 65%), linear-gradient(150deg, var(--bp-accent), color-mix(in oklab, var(--bp-accent), black 50%))",
      }}
    />
  );
}

function Stats({ data }: { data: BookingPageData }) {
  const t = useTranslations("bookingPage");
  const format = useFormatter();
  const stats: { value: string; label: string }[] = [];
  if (data.artists.length > 0) stats.push({ value: String(data.artists.length), label: t("statArtists", { count: data.artists.length }) });
  if (data.reviews?.average && data.reviews.count > 0) {
    stats.push({ value: format.number(data.reviews.average, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), label: t("statRating") });
    stats.push({ value: String(data.reviews.count), label: t("statReviewsLabel", { count: data.reviews.count }) });
  }
  if (data.city) stats.push({ value: data.city, label: t("statBased") });
  if (stats.length === 0) return null;
  return (
    <div className="border-b">
      <dl className="mx-auto grid max-w-6xl grid-cols-2 px-5 @3xl:flex @3xl:divide-x">
        {stats.map((s) => (
          <div key={s.label} className="grid gap-0.5 py-6 @3xl:flex-1 @3xl:px-8 @3xl:first:pl-0">
            <dt className="order-2 text-sm text-muted-foreground">{s.label}</dt>
            <dd className="order-1 truncate text-2xl font-semibold tracking-tight">{s.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Heading({ section, intro, center = false }: { section: BookingSection; intro?: string; center?: boolean }) {
  const t = useTranslations("bookingPage");
  return (
    <div className={cn("grid gap-3", center && "justify-items-center text-center")}>
      <h2 id={`${section.key}-heading`} className="text-3xl font-semibold tracking-tight text-balance @3xl:text-4xl">
        {section.heading || t(sectionHeadingKey[section.key])}
      </h2>
      {intro && <p className="max-w-2xl text-lg text-muted-foreground">{intro}</p>}
    </div>
  );
}

function Section({ section, data, theme, form, preview }: { section: BookingSection; data: BookingPageData; theme: BookingTheme; form: React.ReactNode; preview: boolean }) {
  const t = useTranslations("bookingPage");
  const labelled = { "aria-labelledby": `${section.key}-heading` };

  switch (section.key) {
    case "intro":
      return (
        <section id="intro" className="grid scroll-mt-24 gap-6 @3xl:grid-cols-[1fr_2fr] @3xl:gap-16" {...labelled}>
          <Heading section={section} />
          <div className="grid gap-5 text-xl leading-relaxed text-pretty @3xl:text-2xl @3xl:leading-relaxed">
            {data.intro.split(/\n{2,}/).map((p, i) => (
              <p key={i} className={cn("whitespace-pre-line", i > 0 && "text-lg text-muted-foreground @3xl:text-xl")}>
                {p}
              </p>
            ))}
          </div>
        </section>
      );

    case "artists":
      return (
        <section id="artists" className="grid scroll-mt-24 gap-10" {...labelled}>
          <Heading section={section} intro={t("artistsIntro", { count: data.artists.length })} />
          <ArtistBrowser artists={data.artists} layout={theme.artistLayout} preview={preview} />
        </section>
      );

    case "reviews": {
      const reviews = data.reviews!;
      return (
        <section id="reviews" className="grid scroll-mt-24 gap-10 @4xl:grid-cols-[1fr_2fr] @4xl:gap-16" {...labelled}>
          <div className="grid content-start gap-6">
            <Heading section={section} />
            {reviews.average && (
              <div className="grid gap-2">
                <p className="text-6xl font-semibold tracking-tight">{reviews.average.toFixed(1)}</p>
                <StarRow rating={reviews.average} />
                <p className="text-sm text-muted-foreground">{t("statReviews", { count: reviews.count })}</p>
              </div>
            )}
          </div>
          <ul className="grid gap-4 @xl:grid-cols-2">
            {reviews.items.map((r) => (
              <li key={r.id} className="grid content-between gap-6 rounded-[var(--bp-radius-lg)] border bg-card p-6">
                <div className="grid gap-4">
                  <StarRow rating={r.rating} />
                  {r.comment && <blockquote className="text-pretty leading-relaxed">“{r.comment}”</blockquote>}
                </div>
                <p className="flex items-center gap-3 text-sm">
                  <span className={cn("flex size-8 items-center justify-center rounded-full text-xs font-semibold text-[var(--bp-accent)]", accentTint)}>
                    {r.author.charAt(0).toUpperCase()}
                  </span>
                  <span>
                    <span className="font-medium">{r.author}</span>
                    {r.artist && <span className="text-muted-foreground"> · {r.artist}</span>}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      );
    }

    case "booking":
      return (
        <section id={FORM_ANCHOR} className="scroll-mt-20" {...labelled}>
          <div className="grid gap-10 rounded-[var(--bp-radius-lg)] border bg-card p-6 shadow-xl shadow-black/[0.03] @3xl:p-10 @5xl:grid-cols-[1fr_1.6fr] @5xl:gap-14 @5xl:p-14">
            <div className="grid content-start gap-6">
              <Heading section={section} intro={t("formIntro")} />
              <ul className="grid gap-3 text-sm">
                {(["pointFree", "pointDate", "pointPersonal"] as const).map((k) => (
                  <li key={k} className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--bp-accent)] text-[var(--bp-on-accent)]">
                      <CheckIcon className="size-3" aria-hidden />
                    </span>
                    {t(k, { name: data.name })}
                  </li>
                ))}
              </ul>
              {(data.phone || data.contactEmail) && (
                <div className="grid gap-1 border-t pt-6 text-sm text-muted-foreground">
                  <p>{t("orContact")}</p>
                  {data.phone && (
                    <a href={`tel:${data.phone.replace(/\s/g, "")}`} className="font-medium text-foreground hover:underline">
                      {data.phone}
                    </a>
                  )}
                  {data.contactEmail && (
                    <a href={`mailto:${data.contactEmail}`} className="font-medium break-all text-foreground hover:underline">
                      {data.contactEmail}
                    </a>
                  )}
                </div>
              )}
            </div>
            <div>{form}</div>
          </div>
        </section>
      );

    case "faq":
      return (
        <section id="faq" className="grid scroll-mt-24 gap-10 @4xl:grid-cols-[1fr_2fr] @4xl:gap-16" {...labelled}>
          <Heading section={section} />
          <div className="divide-y border-y">
            {data.faq.map((f, i) => (
              <details key={i} className="group py-5" name="booking-faq">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-lg font-medium marker:hidden [&::-webkit-details-marker]:hidden">
                  {f.question}
                  <PlusIcon className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-45" aria-hidden />
                </summary>
                <p className="mt-3 max-w-prose leading-relaxed whitespace-pre-line text-muted-foreground">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>
      );

    case "contact": {
      const items = [
        data.phone && { icon: PhoneIcon, label: t("phoneLabel"), value: data.phone, href: `tel:${data.phone.replace(/\s/g, "")}` },
        data.contactEmail && { icon: MailIcon, label: t("emailLabel"), value: data.contactEmail, href: `mailto:${data.contactEmail}` },
        data.website && { icon: GlobeIcon, label: t("websiteLabel"), value: data.website.replace(/^https?:\/\//, "").replace(/\/$/, ""), href: data.website, external: true },
        data.address && { icon: MapPinIcon, label: t("addressLabel"), value: data.address },
      ].filter((x) => !!x);
      return (
        <section id="contact" className="grid scroll-mt-24 gap-10" {...labelled}>
          <Heading section={section} />
          <ul className="grid gap-4 @xl:grid-cols-2 @5xl:grid-cols-4">
            {items.map((item) => {
              const body = (
                <>
                  <span className={cn("flex size-10 items-center justify-center rounded-full text-[var(--bp-accent)]", accentTint)}>
                    <item.icon className="size-4" aria-hidden />
                  </span>
                  <span className="grid gap-0.5">
                    <span className="text-sm text-muted-foreground">{item.label}</span>
                    <span className="font-medium break-words">{item.value}</span>
                  </span>
                </>
              );
              return (
                <li key={item.label}>
                  {"href" in item && item.href ? (
                    <a
                      href={item.href}
                      {...("external" in item ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      className="grid h-full gap-4 rounded-[var(--bp-radius-lg)] border bg-card p-5 transition-colors hover:border-[var(--bp-accent)]"
                    >
                      {body}
                    </a>
                  ) : (
                    <div className="grid h-full gap-4 rounded-[var(--bp-radius-lg)] border bg-card p-5">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      );
    }
  }
}

function StarRow({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <span className="flex gap-0.5" role="img" aria-label={`${full} / 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} viewBox="0 0 20 20" className={cn("size-4", i < full ? "fill-amber-400" : "fill-current opacity-25")} aria-hidden>
          <path d="M10 1.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L10 14.9l-5.25 2.7 1-5.8L1.5 7.7l5.9-.9z" />
        </svg>
      ))}
    </span>
  );
}
