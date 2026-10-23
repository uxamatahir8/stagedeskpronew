import { CalendarIcon, HeartIcon, MailIcon, MenuIcon, MapPinIcon, MicIcon, Music2Icon, PhoneIcon, ShieldCheckIcon, SparklesIcon, StarIcon, UsersIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { mediaEmbed, type Section, type SiteTheme } from "@stagedesk/core";
import { InquiryForm } from "@/components/booking/inquiry-form";
import { Inline } from "@/components/site/blocks";
import { cn } from "@/lib/utils";
import type { SiteData } from "@/lib/site-data";
import { siteFontClass } from "./fonts";

/**
 * The building blocks of agency websites. Pure rendering: the public site and
 * the editor's live preview both use these, so what an agency sees while
 * editing is what visitors get. `preview` swaps interactive parts (the booking
 * form) for a stand-in so the editor never sends real inquiries.
 */

export type SiteLang = "nl" | "en";
export type SiteRenderData = Omit<SiteData, "booking"> & { booking: SiteData["booking"] | null };

/** Black or white text, whichever reads better on a colour. */
export function readableOn(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.4 ? "#111111" : "#ffffff";
}

const radius = { sharp: "0.25rem", soft: "0.75rem", round: "1.5rem" } as const;

/** Sets the agency's colours, corner style and font for everything inside. */
export function SiteFrame({ theme, className, children }: { theme: SiteTheme; className?: string; children: React.ReactNode }) {
  const style = {
    "--site-primary": theme.primary,
    "--site-on-primary": readableOn(theme.primary),
    "--site-accent": theme.accent,
    "--site-on-accent": readableOn(theme.accent),
    "--site-radius": radius[theme.radius],
    // The booking form uses StageDesk's form components; give them the agency's colours here.
    "--primary": theme.accent,
    "--primary-foreground": readableOn(theme.accent),
    "--ring": theme.accent,
    fontFamily: "var(--site-font), ui-sans-serif, system-ui, sans-serif",
  } as React.CSSProperties;
  return (
    // A size container, so sections adapt to the space they get: the window on the live site, the preview box in the editor.
    <div style={style} className={cn(siteFontClass[theme.font], "@container bg-white text-neutral-900", className)}>
      {children}
    </div>
  );
}

const buttonClass = "inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold shadow-sm transition-opacity hover:opacity-90 rounded-[var(--site-radius)]";
const primaryButton = cn(buttonClass, "bg-[var(--site-accent)] text-[var(--site-on-accent)]");

export function SiteHeader({
  data,
  theme,
  nav,
  ctaHref,
  langSwitch,
}: {
  data: SiteRenderData;
  theme: SiteTheme;
  nav: { href: string; label: string; current: boolean }[];
  ctaHref: string;
  langSwitch?: { href: string; label: string } | null;
}) {
  const t = useTranslations("agencySite");
  const dark = theme.mode === "dark";
  return (
    <header className={cn("sticky top-0 z-30 border-b backdrop-blur", dark ? "border-white/10 bg-[var(--site-primary)]/95 text-[var(--site-on-primary)]" : "border-neutral-200 bg-white/90")}>
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 @xl:px-6">
        <a href={nav[0]?.href ?? "/"} className="flex items-center gap-3 font-bold">
          {/* eslint-disable-next-line @next/next/no-img-element -- agency logos are uploaded files of any size */}
          {data.agency.logo ? <img src={data.agency.logo} alt="" className="h-10 w-auto max-w-40 object-contain" /> : null}
          <span className="text-lg">{data.agency.name}</span>
        </a>
        <nav aria-label={t("menu")} className="hidden flex-1 flex-wrap items-center gap-x-5 gap-y-1 text-sm @3xl:flex">
          {nav.map((n, i) => (
            <a key={`${i}-${n.label}`} href={n.href} aria-current={n.current ? "page" : undefined} className={cn("py-1 opacity-80 hover:opacity-100", n.current && "font-semibold opacity-100")}>
              {n.label}
            </a>
          ))}
        </nav>
        {langSwitch && (
          <a href={langSwitch.href} className="hidden text-sm font-medium opacity-80 hover:opacity-100 @3xl:inline">
            {langSwitch.label}
          </a>
        )}
        <a href={ctaHref} className={cn(buttonClass, "ml-auto hidden px-4 py-2 @3xl:ml-0 @3xl:inline-flex", "bg-[var(--site-accent)] text-[var(--site-on-accent)]")}>
          {t("requestQuote")}
        </a>
        {/* On narrow screens the menu folds into a button; <details> needs no script. */}
        <details className="group relative ml-auto @3xl:hidden">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-[var(--site-radius)] border border-current/20 px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <MenuIcon className="size-4" aria-hidden />
            {t("menu")}
          </summary>
          <div className="absolute right-0 z-40 mt-2 grid w-60 gap-1 rounded-[var(--site-radius)] border border-neutral-200 bg-white p-2 text-neutral-900 shadow-xl">
            {nav.map((n, i) => (
              <a key={`m${i}-${n.label}`} href={n.href} aria-current={n.current ? "page" : undefined} className={cn("rounded-md px-3 py-2 text-sm hover:bg-neutral-100", n.current && "font-semibold")}>
                {n.label}
              </a>
            ))}
            {langSwitch && (
              <a href={langSwitch.href} className="rounded-md px-3 py-2 text-sm hover:bg-neutral-100">
                {langSwitch.label}
              </a>
            )}
            <a href={ctaHref} className={cn(primaryButton, "mt-1 w-full")}>
              {t("requestQuote")}
            </a>
          </div>
        </details>
      </div>
    </header>
  );
}

export function SiteFooter({ data, branding }: { data: SiteRenderData; branding: boolean }) {
  const t = useTranslations("agencySite");
  const a = data.agency;
  return (
    <footer className="border-t border-neutral-200 bg-neutral-50">
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-10 text-sm @xl:grid-cols-[1fr_auto] @xl:px-6">
        <div className="grid gap-1">
          <span className="text-base font-semibold">{a.name}</span>
          {(a.addressLine || a.city) && <span className="text-neutral-600">{[a.addressLine, [a.postalCode, a.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</span>}
          <span className="flex flex-wrap gap-x-4 text-neutral-600">
            {a.contactEmail && <a href={`mailto:${a.contactEmail}`}>{a.contactEmail}</a>}
            {a.phone && <a href={`tel:${a.phone.replace(/\s+/g, "")}`}>{a.phone}</a>}
          </span>
        </div>
        {branding && (
          <a href="https://stagedesk.nl" className="self-end text-xs text-neutral-500 hover:text-neutral-800">
            {t("madeWith")}
          </a>
        )}
      </div>
    </footer>
  );
}

const highlightIcons = { music: Music2Icon, heart: HeartIcon, star: StarIcon, sparkles: SparklesIcon, calendar: CalendarIcon, shield: ShieldCheckIcon, users: UsersIcon, mic: MicIcon } as const;

function Heading({ children, intro, center = true }: { children: React.ReactNode; intro?: string; center?: boolean }) {
  if (!children) return null;
  return (
    <div className={cn("mb-10 grid max-w-2xl gap-3", center && "mx-auto text-center")}>
      <h2 className="text-3xl font-bold tracking-tight text-balance @xl:text-4xl">{children}</h2>
      {intro && <p className="text-lg opacity-75">{intro}</p>}
    </div>
  );
}

/** Paragraphs separated by blank lines, with **bold**, *italic* and [links](https://…). */
function Paragraphs({ text }: { text: string }) {
  return (
    // Links and bold text follow the agency theme, not StageDesk colours.
    <div className="grid gap-4 text-lg leading-relaxed opacity-90 [&_a]:text-[var(--site-accent)] [&_strong]:text-inherit">
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          <Inline text={p} />
        </p>
      ))}
    </div>
  );
}

const backgrounds = {
  default: "bg-white",
  muted: "bg-neutral-50",
  brand: "bg-[var(--site-primary)] text-[var(--site-on-primary)]",
} as const;

export function SiteSection({ section, data, preview = false, ctaHref, contactHref }: { section: Section; data: SiteRenderData; preview?: boolean; ctaHref: string; contactHref: string }) {
  const t = useTranslations("agencySite");
  const tu = useTranslations("units");
  const format = useFormatter();
  const target = (s: { ctaTarget: string; ctaUrl: string }) => (s.ctaTarget === "url" && s.ctaUrl ? s.ctaUrl : s.ctaTarget === "contact" ? contactHref : ctaHref);
  const wrap = (children: React.ReactNode, narrow = false) => (
    <section id={section.id} className={cn("scroll-mt-20", backgrounds[section.background])}>
      <div className={cn("mx-auto w-full px-4 py-16 @xl:px-6 @xl:py-20", narrow ? "max-w-3xl" : "max-w-6xl")}>{children}</div>
    </section>
  );

  switch (section.type) {
    case "hero":
      return (
        <section id={section.id} className={cn("relative overflow-hidden", backgrounds[section.background])}>
          {section.image && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- images agencies upload or link */}
              <img src={section.image} alt="" className="absolute inset-0 size-full object-cover" />
              <div aria-hidden className="absolute inset-0 bg-black/50" />
            </>
          )}
          <div className={cn("relative mx-auto grid w-full max-w-6xl gap-6 px-4 py-24 @xl:px-6 @xl:py-32", section.align === "center" && "justify-items-center text-center", section.image && "text-white")}>
            <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-balance @xl:text-6xl">{section.title}</h1>
            {section.subtitle && <p className="max-w-2xl text-lg opacity-85 @xl:text-xl">{section.subtitle}</p>}
            {section.ctaLabel && (
              <a href={target(section)} className={primaryButton}>
                {section.ctaLabel}
              </a>
            )}
          </div>
        </section>
      );
    case "text":
      return wrap(
        <>
          {section.heading && <h2 className="mb-6 text-3xl font-bold tracking-tight text-balance">{section.heading}</h2>}
          <Paragraphs text={section.body} />
        </>,
        true,
      );
    case "highlights":
      return wrap(
        <>
          <Heading>{section.heading}</Heading>
          <div className={cn("grid gap-6 @xl:grid-cols-2", section.items.length % 3 === 0 && "@5xl:grid-cols-3")}>
            {section.items.map((item, i) => {
              const Icon = highlightIcons[item.icon];
              return (
                <div key={i} className="grid content-start gap-3">
                  <span className="flex size-12 items-center justify-center rounded-[var(--site-radius)] bg-[var(--site-accent)]/15 text-[var(--site-accent)]">
                    <Icon className="size-6" aria-hidden />
                  </span>
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  {item.body && <p className="opacity-75">{item.body}</p>}
                </div>
              );
            })}
          </div>
        </>,
      );
    case "artists": {
      const artists = data.artists.slice(0, section.max);
      return wrap(
        <>
          <Heading intro={section.intro}>{section.heading}</Heading>
          {artists.length === 0 ? (
            <p className="text-center opacity-60">{t("noArtists")}</p>
          ) : (
            <div className="grid gap-6 @xl:grid-cols-2 @5xl:grid-cols-3">
              {artists.map((a) => (
                <article key={a.id} className="grid content-start gap-3 overflow-hidden rounded-[var(--site-radius)] border border-black/10 bg-white text-neutral-900">
                  <div className="aspect-[4/3] bg-neutral-100">
                    {a.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- artist photos are uploaded files
                      <img src={a.photoUrl} alt={a.stageName} className="size-full object-cover" />
                    ) : (
                      <div className="flex size-full items-center justify-center bg-linear-to-br from-[var(--site-primary)] to-[var(--site-accent)] text-5xl font-bold text-white/90">{a.stageName.slice(0, 1)}</div>
                    )}
                  </div>
                  <div className="grid gap-1 px-5 pb-5">
                    <h3 className="text-lg font-semibold">{a.stageName}</h3>
                    {a.genres.length > 0 && <p className="text-sm text-neutral-500">{a.genres.slice(0, 4).join(" · ")}</p>}
                    {a.bio && <p className="line-clamp-3 text-sm text-neutral-700">{a.bio}</p>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </>,
      );
    }
    case "packages":
      return wrap(
        <>
          <Heading intro={section.intro}>{section.heading}</Heading>
          <div className="grid gap-4 @xl:grid-cols-2 @5xl:grid-cols-3">
            {data.packages.map((p) => (
              <div key={p.id} className="grid content-start gap-2 rounded-[var(--site-radius)] border border-black/10 bg-white p-6 text-neutral-900">
                <h3 className="font-semibold">{p.name}</h3>
                {p.description && <p className="text-sm text-neutral-600">{p.description}</p>}
                {section.showPrices && (
                  <p className="mt-2 text-2xl font-bold tabular-nums">
                    {format.number(p.priceCents / 100, { style: "currency", currency: "EUR" })}
                    <span className="ml-1 text-sm font-normal text-neutral-500">{tu.has(p.unit as "hour") ? tu(p.unit as "hour") : ""}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
          {section.showPrices && <p className="mt-4 text-center text-sm opacity-60">{t("pricesIncludeVat")}</p>}
        </>,
      );
    case "reviews": {
      const items = data.reviews.items.slice(0, section.max);
      return wrap(
        <>
          <Heading intro={data.reviews.count ? t("reviewsSummary", { average: (data.reviews.average ?? 0).toFixed(1), count: data.reviews.count }) : undefined}>{section.heading}</Heading>
          {items.length === 0 ? (
            <p className="text-center opacity-60">{t("noReviews")}</p>
          ) : (
            <div className="grid gap-6 @3xl:grid-cols-3">
              {items.map((r) => (
                <figure key={r.id} className="grid content-start gap-3 rounded-[var(--site-radius)] border border-black/10 bg-white p-6 text-neutral-900">
                  <span className="flex gap-0.5 text-[var(--site-accent)]" aria-label={t("stars", { rating: r.rating })}>
                    {Array.from({ length: 5 }, (_, i) => (
                      <StarIcon key={i} className={cn("size-4", i < r.rating ? "fill-current" : "opacity-25")} aria-hidden />
                    ))}
                  </span>
                  {r.comment && <blockquote className="text-neutral-700">“{r.comment}”</blockquote>}
                  {r.author && <figcaption className="text-sm font-semibold">{r.author}</figcaption>}
                </figure>
              ))}
            </div>
          )}
        </>,
      );
    }
    case "gallery":
      return wrap(
        <>
          <Heading>{section.heading}</Heading>
          <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-3">
            {section.images.map((img, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- images agencies upload or link
              <img key={i} src={img.url} alt={img.alt} className="aspect-square w-full rounded-[var(--site-radius)] object-cover" loading="lazy" />
            ))}
          </div>
        </>,
      );
    case "video": {
      const embed = mediaEmbed(section.url);
      return wrap(
        <>
          <Heading>{section.heading}</Heading>
          {embed ? (
            <div className="overflow-hidden rounded-[var(--site-radius)] bg-black">
              <iframe src={embed.embedUrl} title={section.heading || t("video")} className={cn("w-full", embed.provider === "soundcloud" || embed.provider === "mixcloud" ? "h-40" : "aspect-video")} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
            </div>
          ) : (
            <p className="text-center opacity-60">{t("videoUnsupported")}</p>
          )}
        </>,
        true,
      );
    }
    case "faq":
      return wrap(
        <>
          <Heading>{section.heading}</Heading>
          <div className="grid gap-3">
            {section.items.map((item, i) => (
              <details key={i} className="group rounded-[var(--site-radius)] border border-black/10 bg-white p-5 text-neutral-900">
                <summary className="cursor-pointer list-none font-semibold">{item.q}</summary>
                <p className="mt-3 whitespace-pre-line text-neutral-700">{item.a}</p>
              </details>
            ))}
          </div>
        </>,
        true,
      );
    case "cta":
      return wrap(
        <div className="grid justify-items-center gap-5 text-center">
          <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-balance @xl:text-4xl">{section.heading}</h2>
          {section.body && <p className="max-w-xl text-lg opacity-80">{section.body}</p>}
          {section.ctaLabel && (
            <a href={target(section)} className={primaryButton}>
              {section.ctaLabel}
            </a>
          )}
        </div>,
      );
    case "booking":
      return wrap(
        <>
          <Heading intro={section.intro}>{section.heading}</Heading>
          <div className="rounded-[calc(var(--site-radius)*1.5)] border border-black/10 bg-white p-6 text-neutral-900 shadow-sm @xl:p-10">
            {preview || !data.booking ? (
              <div className="grid gap-3 text-center text-neutral-500">
                <p className="font-medium text-neutral-800">{t("formPreview")}</p>
                <p className="text-sm">{t("formPreviewHint")}</p>
              </div>
            ) : (
              <InquiryForm slug={data.booking.slug} artists={data.artists.map((a) => ({ id: a.id, stageName: a.stageName }))} fullyBooked={data.booking.fullyBooked} siteKey={data.booking.siteKey} today={data.booking.today} />
            )}
          </div>
        </>,
        true,
      );
    case "contact": {
      const a = data.agency;
      const address = [a.addressLine, [a.postalCode, a.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      return wrap(
        <>
          <Heading intro={section.intro}>{section.heading}</Heading>
          <div className="mx-auto grid max-w-3xl gap-4 @xl:grid-cols-3">
            {a.contactEmail && (
              <a href={`mailto:${a.contactEmail}`} className="grid justify-items-center gap-2 rounded-[var(--site-radius)] border border-black/10 bg-white p-6 text-center text-neutral-900">
                <MailIcon className="size-6 text-[var(--site-accent)]" aria-hidden />
                <span className="text-sm break-all">{a.contactEmail}</span>
              </a>
            )}
            {a.phone && (
              <a href={`tel:${a.phone.replace(/\s+/g, "")}`} className="grid justify-items-center gap-2 rounded-[var(--site-radius)] border border-black/10 bg-white p-6 text-center text-neutral-900">
                <PhoneIcon className="size-6 text-[var(--site-accent)]" aria-hidden />
                <span className="text-sm">{a.phone}</span>
              </a>
            )}
            {address && (
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noopener" className="grid justify-items-center gap-2 rounded-[var(--site-radius)] border border-black/10 bg-white p-6 text-center text-neutral-900">
                <MapPinIcon className="size-6 text-[var(--site-accent)]" aria-hidden />
                <span className="text-sm">{address}</span>
              </a>
            )}
          </div>
        </>,
      );
    }
  }
}
