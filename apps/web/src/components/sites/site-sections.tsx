import { CheckIcon, MailIcon, MapPinIcon, MenuIcon, PhoneIcon, StarIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { iconKind, mediaEmbed, type Section, type SiteTheme } from "@stagedesk/core";
import { InquiryForm } from "@/components/booking/inquiry-form";
import { Inline } from "@/components/site/blocks";
import { cn } from "@/lib/utils";
import type { SiteData } from "@/lib/site-data";
import { siteFontClass, siteHeadingFontClass } from "./fonts";
import { siteIconComponents } from "./icons";

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

/** The page's own colours: background, text, a quieter surface, cards and lines. */
const pages = {
  light: { bg: "#ffffff", fg: "#18181b", muted: "#f4f4f5", card: "#ffffff", cardFg: "#18181b", border: "rgb(0 0 0 / 0.1)", glass: "rgb(255 255 255 / 0.65)" },
  tinted: {
    bg: "color-mix(in oklab, var(--site-primary) 5%, white)",
    fg: "#18181b",
    muted: "color-mix(in oklab, var(--site-primary) 10%, white)",
    card: "#ffffff",
    cardFg: "#18181b",
    border: "color-mix(in oklab, var(--site-primary) 16%, transparent)",
    glass: "rgb(255 255 255 / 0.6)",
  },
  dark: { bg: "#0b0b10", fg: "#f4f4f5", muted: "#13131a", card: "#17171f", cardFg: "#f4f4f5", border: "rgb(255 255 255 / 0.1)", glass: "rgb(255 255 255 / 0.06)" },
} as const;

/** Sets the agency's colours, fonts, corners and surfaces for everything inside. */
export function SiteFrame({ theme, className, children }: { theme: SiteTheme; className?: string; children: React.ReactNode }) {
  const page = pages[theme.page];
  const style = {
    "--site-primary": theme.primary,
    "--site-on-primary": readableOn(theme.primary),
    "--site-accent": theme.accent,
    "--site-on-accent": readableOn(theme.accent),
    "--site-radius": radius[theme.radius],
    "--site-bg": page.bg,
    "--site-fg": page.fg,
    "--site-muted": page.muted,
    "--site-card": page.card,
    "--site-card-fg": page.cardFg,
    "--site-border": page.border,
    "--site-glass": page.glass,
    // The booking form uses StageDesk's form components; give them the agency's colours here.
    "--primary": theme.accent,
    "--primary-foreground": readableOn(theme.accent),
    "--ring": theme.accent,
    ...(theme.headingFont === "same" ? { "--site-heading-font": "var(--site-font)" } : {}),
    fontFamily: "var(--site-font), ui-sans-serif, system-ui, sans-serif",
  } as React.CSSProperties;
  return (
    // A size container, so sections adapt to the space they get: the window on the live site, the preview box in the editor.
    <div
      style={style}
      className={cn(
        siteFontClass[theme.font],
        theme.headingFont !== "same" && siteHeadingFontClass[theme.headingFont],
        "@container bg-[var(--site-bg)] text-[var(--site-fg)] [&_:is(h1,h2,h3)]:[font-family:var(--site-heading-font),var(--site-font),ui-sans-serif,system-ui,sans-serif]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The agency's button look. */
export function siteButton(theme: SiteTheme, size: "md" | "sm" = "md") {
  const shape = theme.buttons === "pill" ? "rounded-full" : "rounded-[var(--site-radius)]";
  const look = {
    solid: "bg-[var(--site-accent)] text-[var(--site-on-accent)] shadow-sm hover:brightness-110",
    pill: "bg-[var(--site-accent)] text-[var(--site-on-accent)] shadow-sm hover:brightness-110",
    outline: "border-2 border-[var(--site-accent)] text-current hover:bg-[var(--site-accent)] hover:text-[var(--site-on-accent)]",
    soft: "bg-[color-mix(in_oklab,var(--site-accent)_18%,transparent)] text-current hover:bg-[color-mix(in_oklab,var(--site-accent)_28%,transparent)]",
  }[theme.buttons];
  return cn("inline-flex items-center justify-center gap-2 font-semibold transition", size === "md" ? "px-6 py-3 text-sm" : "px-4 py-2 text-sm", shape, look);
}

/** The agency's card look; cards carry their own text colour so they read on any section background. */
export function siteCard(theme: SiteTheme) {
  return {
    flat: "bg-[color-mix(in_oklab,currentColor_6%,transparent)]",
    outlined: "border border-[var(--site-border)] bg-[var(--site-card)] text-[var(--site-card-fg)]",
    elevated: "bg-[var(--site-card)] text-[var(--site-card-fg)] shadow-xl shadow-black/[0.07] ring-1 ring-[var(--site-border)]",
    glass: "border border-white/20 bg-[var(--site-glass)] backdrop-blur-md",
  }[theme.cards];
}

/** A built-in icon, an emoji, or an uploaded image. */
export function SiteIconView({ value, className }: { value: string; className?: string }) {
  const kind = iconKind(value);
  if (kind === "builtin") {
    const Icon = siteIconComponents[value as keyof typeof siteIconComponents];
    return <Icon className={cn("size-6", className)} aria-hidden />;
  }
  if (kind === "emoji") return <span className={cn("text-2xl leading-none", className)} aria-hidden>{value}</span>;
  // eslint-disable-next-line @next/next/no-img-element -- icons agencies upload
  if (kind === "image") return <img src={value} alt="" className={cn("size-7 object-contain", className)} />;
  return null;
}

/** The icon in a soft accent tile, as used by highlights, stats and steps. */
function IconTile({ value, className }: { value: string; className?: string }) {
  if (!value) return null;
  return (
    <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-[var(--site-radius)] bg-[color-mix(in_oklab,var(--site-accent)_15%,transparent)] text-[var(--site-accent)]", className)}>
      <SiteIconView value={value} />
    </span>
  );
}

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
  const centered = theme.headerLayout === "centered";
  const logo = (
    <a href={nav[0]?.href ?? "/"} className="flex items-center gap-3 font-bold">
      {/* eslint-disable-next-line @next/next/no-img-element -- agency logos are uploaded files of any size */}
      {data.agency.logo ? <img src={data.agency.logo} alt="" className="h-10 w-auto max-w-40 object-contain" /> : null}
      <span className="text-lg">{data.agency.name}</span>
    </a>
  );
  const links = nav.map((n, i) => (
    <a key={`${i}-${n.label}`} href={n.href} aria-current={n.current ? "page" : undefined} className={cn("py-1 opacity-80 hover:opacity-100", n.current && "font-semibold opacity-100")}>
      {n.label}
    </a>
  ));
  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b backdrop-blur",
        dark ? "border-white/10 bg-[var(--site-primary)]/95 text-[var(--site-on-primary)]" : "border-[var(--site-border)] bg-[color-mix(in_oklab,var(--site-bg)_90%,transparent)]",
      )}
    >
      <div className={cn("mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 @xl:px-6", centered && "@3xl:justify-center")}>
        {logo}
        <nav aria-label={t("menu")} className={cn("hidden flex-wrap items-center gap-x-5 gap-y-1 text-sm @3xl:flex", centered ? "@3xl:order-last @3xl:w-full @3xl:justify-center" : "flex-1")}>
          {links}
        </nav>
        {langSwitch && (
          <a href={langSwitch.href} className="hidden text-sm font-medium opacity-80 hover:opacity-100 @3xl:inline">
            {langSwitch.label}
          </a>
        )}
        <a href={ctaHref} className={cn(siteButton(theme, "sm"), "ml-auto hidden @3xl:inline-flex", centered ? "@3xl:ml-0" : "@3xl:ml-0")}>
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
            <a href={ctaHref} className={cn(siteButton(theme), "mt-1 w-full")}>
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
    <footer className="border-t border-[var(--site-border)] bg-[var(--site-muted)]">
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-10 text-sm @xl:grid-cols-[1fr_auto] @xl:px-6">
        <div className="grid gap-1">
          <span className="text-base font-semibold">{a.name}</span>
          {(a.addressLine || a.city) && <span className="opacity-70">{[a.addressLine, [a.postalCode, a.city].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</span>}
          <span className="flex flex-wrap gap-x-4 opacity-70">
            {a.contactEmail && <a href={`mailto:${a.contactEmail}`}>{a.contactEmail}</a>}
            {a.phone && <a href={`tel:${a.phone.replace(/\s+/g, "")}`}>{a.phone}</a>}
          </span>
        </div>
        {branding && (
          <a href="https://stagedesk.nl" className="self-end text-xs opacity-60 hover:opacity-100">
            {t("madeWith")}
          </a>
        )}
      </div>
    </footer>
  );
}

function Heading({ children, intro, align = "center" }: { children: React.ReactNode; intro?: string; align?: "center" | "left" }) {
  if (!children && !intro) return null;
  return (
    <div className={cn("mb-10 grid max-w-2xl gap-3", align === "center" && "mx-auto text-center")}>
      {children && <h2 className="text-3xl font-bold tracking-tight text-balance @xl:text-4xl">{children}</h2>}
      {intro && <p className="text-lg opacity-75">{intro}</p>}
    </div>
  );
}

/** Paragraphs separated by blank lines, with **bold**, *italic* and [links](https://…). */
function Paragraphs({ text }: { text: string }) {
  return (
    // Links and bold text follow the agency theme, not StageDesk colours.
    <div className="grid gap-4 text-lg leading-relaxed opacity-90 [&_a]:text-[var(--site-accent)] [&_a]:underline [&_strong]:text-inherit">
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          <Inline text={p} />
        </p>
      ))}
    </div>
  );
}

const backgrounds: Record<Section["background"], string> = {
  default: "",
  muted: "bg-[var(--site-muted)]",
  brand: "bg-[var(--site-primary)] text-[var(--site-on-primary)]",
  accent: "bg-[var(--site-accent)] text-[var(--site-on-accent)]",
  dark: "bg-[#0a0a0f] text-white",
  gradient: "bg-linear-135 from-[var(--site-primary)] to-[var(--site-accent)] text-white",
  image: "bg-neutral-900 text-white",
};
const spacings = { compact: "py-12 @xl:py-14", normal: "py-16 @xl:py-20", large: "py-20 @xl:py-28" } as const;
const themeSpacing = { compact: "compact", normal: "normal", airy: "large" } as const;

function Stars({ rating, label }: { rating: number; label: string }) {
  return (
    <span className="flex gap-0.5 text-amber-400" role="img" aria-label={label}>
      {Array.from({ length: 5 }, (_, i) => (
        <StarIcon key={i} className={cn("size-4", i < rating ? "fill-current" : "opacity-25")} aria-hidden />
      ))}
    </span>
  );
}

/** Two-to-four columns that collapse on narrow screens. */
const columnClass = { 2: "@xl:grid-cols-2", 3: "@xl:grid-cols-2 @4xl:grid-cols-3", 4: "@xl:grid-cols-2 @4xl:grid-cols-4" } as const;

export function SiteSection({
  section,
  data,
  theme,
  preview = false,
  ctaHref,
  contactHref,
}: {
  section: Section;
  data: SiteRenderData;
  theme: SiteTheme;
  preview?: boolean;
  ctaHref: string;
  contactHref: string;
}) {
  const t = useTranslations("agencySite");
  const tu = useTranslations("units");
  const format = useFormatter();
  const card = siteCard(theme);
  const button = siteButton(theme);
  const align = section.headingAlign ?? "center";
  const target = (s: { ctaTarget: string; ctaUrl: string }) => (s.ctaTarget === "url" && s.ctaUrl ? s.ctaUrl : s.ctaTarget === "contact" ? contactHref : ctaHref);
  const external = (href: string) => (/^https?:/.test(href) ? { target: "_blank", rel: "noopener" } : {});
  const imageBackground = section.background === "image" && section.backgroundImage;
  const wrap = (children: React.ReactNode, width: "narrow" | "wide" | "full" = "wide") => (
    <section id={section.id} className={cn("relative isolate scroll-mt-20 overflow-hidden", backgrounds[section.background])}>
      {imageBackground && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- images agencies upload or link */}
          <img src={section.backgroundImage} alt="" className="absolute inset-0 -z-20 size-full object-cover" />
          <div aria-hidden className="absolute inset-0 -z-10 bg-black/55" />
        </>
      )}
      <div className={cn("mx-auto w-full px-4 @xl:px-6", spacings[section.spacing ?? themeSpacing[theme.spacing]], width === "narrow" ? "max-w-3xl" : width === "wide" ? "max-w-6xl" : "max-w-none")}>{children}</div>
    </section>
  );

  switch (section.type) {
    case "hero": {
      const image = section.image || (imageBackground ? section.backgroundImage : "");
      return (
        <section id={section.id} className={cn("relative isolate overflow-hidden", backgrounds[section.background])}>
          {image && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- images agencies upload or link */}
              <img src={image} alt="" className="absolute inset-0 -z-20 size-full object-cover" />
              <div aria-hidden className="absolute inset-0 -z-10 bg-linear-to-t from-black/75 via-black/45 to-black/25" />
            </>
          )}
          <div className={cn("mx-auto grid w-full max-w-6xl gap-6 px-4 py-24 @xl:px-6 @xl:py-36", section.align === "center" && "justify-items-center text-center", image && "text-white")}>
            <h1 className="max-w-4xl text-4xl leading-[1.05] font-bold tracking-tight text-balance @xl:text-6xl @5xl:text-7xl">{section.title}</h1>
            {section.subtitle && <p className="max-w-2xl text-lg opacity-85 @xl:text-xl">{section.subtitle}</p>}
            {section.ctaLabel && (
              <a href={target(section)} className={cn(button, "mt-2 px-7 py-3.5 text-base")}>
                {section.ctaLabel}
              </a>
            )}
          </div>
        </section>
      );
    }
    case "text":
      return wrap(
        <div className={cn(align === "center" && "text-center")}>
          {section.heading && <h2 className="mb-6 text-3xl font-bold tracking-tight text-balance">{section.heading}</h2>}
          <Paragraphs text={section.body} />
        </div>,
        "narrow",
      );
    case "highlights":
      return wrap(
        <>
          <Heading align={align}>{section.heading}</Heading>
          <div className={cn("grid gap-8 @xl:grid-cols-2", section.items.length % 3 === 0 && "@5xl:grid-cols-3")}>
            {section.items.map((item, i) => (
              <div key={i} className="grid content-start gap-3">
                <IconTile value={item.icon} />
                <h3 className="text-lg font-semibold">{item.title}</h3>
                {item.body && <p className="opacity-75">{item.body}</p>}
              </div>
            ))}
          </div>
        </>,
      );
    case "cards":
      return wrap(
        <>
          <Heading intro={section.intro} align={align}>
            {section.heading}
          </Heading>
          <div className={cn("grid gap-5", section.layout === "list" ? "mx-auto max-w-3xl" : columnClass[section.columns as 2 | 3 | 4])}>
            {section.items.map((item, i) => {
              const href = item.linkUrl || "";
              const linkLabel = item.linkLabel && href && (
                <a href={href} {...external(href)} className="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-semibold text-[var(--site-accent)] hover:underline">
                  {item.linkLabel} →
                </a>
              );
              if (section.layout === "overlay") {
                return (
                  <article key={i} className="relative isolate flex min-h-72 flex-col justify-end overflow-hidden rounded-[var(--site-radius)] bg-linear-135 from-[var(--site-primary)] to-[var(--site-accent)] p-6 text-white">
                    {item.image && (
                      // eslint-disable-next-line @next/next/no-img-element -- images agencies upload or link
                      <img src={item.image} alt="" className="absolute inset-0 -z-20 size-full object-cover" loading="lazy" />
                    )}
                    <div aria-hidden className="absolute inset-0 -z-10 bg-linear-to-t from-black/85 via-black/35 to-transparent" />
                    {item.icon && <SiteIconView value={item.icon} className="mb-3" />}
                    <h3 className="text-xl font-semibold">{item.title}</h3>
                    {item.body && <p className="mt-1 text-sm opacity-85">{item.body}</p>}
                    {linkLabel && <span className="[&_a]:text-white">{linkLabel}</span>}
                  </article>
                );
              }
              if (section.layout === "list") {
                return (
                  <article key={i} className={cn("flex gap-5 rounded-[var(--site-radius)] p-5", card)}>
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- images agencies upload or link
                      <img src={item.image} alt="" className="size-20 shrink-0 rounded-[var(--site-radius)] object-cover" loading="lazy" />
                    ) : (
                      <IconTile value={item.icon} />
                    )}
                    <div className="flex flex-col gap-1">
                      <h3 className="text-lg font-semibold">{item.title}</h3>
                      {item.body && <p className="opacity-75">{item.body}</p>}
                      {linkLabel}
                    </div>
                  </article>
                );
              }
              return (
                <article key={i} className={cn("flex flex-col overflow-hidden rounded-[var(--site-radius)]", card, section.layout === "centered" && "items-center text-center")}>
                  {item.image && (
                    // eslint-disable-next-line @next/next/no-img-element -- images agencies upload or link
                    <img src={item.image} alt="" className="aspect-[16/10] w-full object-cover" loading="lazy" />
                  )}
                  <div className={cn("flex flex-1 flex-col gap-2 p-6", section.layout === "centered" && "items-center")}>
                    {item.icon && <IconTile value={item.icon} className="mb-2" />}
                    <h3 className="text-lg font-semibold">{item.title}</h3>
                    {item.body && <p className="opacity-75">{item.body}</p>}
                    {linkLabel}
                  </div>
                </article>
              );
            })}
          </div>
        </>,
      );
    case "stats":
      return wrap(
        <>
          <Heading align={align}>{section.heading}</Heading>
          <dl className={cn("grid gap-8 text-center", section.items.length >= 4 ? "grid-cols-2 @4xl:grid-cols-4" : "grid-cols-1 @xl:grid-cols-3", section.items.length === 2 && "@xl:grid-cols-2")}>
            {section.items.map((item, i) => (
              <div key={i} className="grid justify-items-center gap-2">
                {item.icon && <SiteIconView value={item.icon} className="mb-1 text-[var(--site-accent)]" />}
                <dd className="text-4xl font-bold tracking-tight @xl:text-5xl">{item.value}</dd>
                {item.label && <dt className="order-last text-sm opacity-70">{item.label}</dt>}
              </div>
            ))}
          </dl>
        </>,
      );
    case "steps":
      return wrap(
        <>
          <Heading intro={section.intro} align={align}>
            {section.heading}
          </Heading>
          <ol className={cn("grid gap-6", section.layout === "horizontal" ? columnClass[Math.min(4, Math.max(2, section.items.length)) as 2 | 3 | 4] : "mx-auto max-w-2xl")}>
            {section.items.map((item, i) => (
              <li key={i} className={cn("relative flex gap-4", section.layout === "horizontal" && "flex-col")}>
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--site-accent)] text-lg font-bold text-[var(--site-on-accent)]">
                  {item.icon ? <SiteIconView value={item.icon} className="size-5 text-2xl" /> : i + 1}
                </span>
                <div className="grid gap-1">
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  {item.body && <p className="opacity-75">{item.body}</p>}
                </div>
              </li>
            ))}
          </ol>
        </>,
      );
    case "split":
      return wrap(
        <div className="grid items-center gap-10 @3xl:grid-cols-2 @3xl:gap-16">
          <div className={cn("overflow-hidden rounded-[var(--site-radius)]", section.imageSide === "left" ? "@3xl:order-first" : "@3xl:order-last")}>
            {section.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- images agencies upload or link
              <img src={section.image} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />
            ) : (
              <div aria-hidden className="aspect-[4/3] w-full bg-linear-135 from-[var(--site-primary)] to-[var(--site-accent)]" />
            )}
          </div>
          <div className="grid content-center gap-5">
            {section.heading && <h2 className="text-3xl font-bold tracking-tight text-balance @xl:text-4xl">{section.heading}</h2>}
            {section.body && <Paragraphs text={section.body} />}
            {section.items.length > 0 && (
              <ul className="grid gap-2">
                {section.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--site-accent)] text-[var(--site-on-accent)]">
                      <CheckIcon className="size-3" aria-hidden />
                    </span>
                    {item.text}
                  </li>
                ))}
              </ul>
            )}
            {section.ctaLabel && (
              <div>
                <a href={target(section)} className={button}>
                  {section.ctaLabel}
                </a>
              </div>
            )}
          </div>
        </div>,
      );
    case "artists": {
      const artists = data.artists.slice(0, section.max);
      return wrap(
        <>
          <Heading intro={section.intro} align={align}>
            {section.heading}
          </Heading>
          {artists.length === 0 ? (
            <p className="text-center opacity-60">{t("noArtists")}</p>
          ) : (
            <div className="grid gap-6 @xl:grid-cols-2 @5xl:grid-cols-3">
              {artists.map((a) => (
                <article key={a.id} className={cn("grid content-start gap-3 overflow-hidden rounded-[var(--site-radius)]", card)}>
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
                    {a.genres.length > 0 && <p className="text-sm opacity-60">{a.genres.slice(0, 4).join(" · ")}</p>}
                    {a.bio && <p className="line-clamp-3 text-sm opacity-80">{a.bio}</p>}
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
          <Heading intro={section.intro} align={align}>
            {section.heading}
          </Heading>
          <div className="grid gap-4 @xl:grid-cols-2 @5xl:grid-cols-3">
            {data.packages.map((p) => (
              <div key={p.id} className={cn("grid content-start gap-2 rounded-[var(--site-radius)] p-6", card)}>
                <h3 className="font-semibold">{p.name}</h3>
                {p.description && <p className="text-sm opacity-70">{p.description}</p>}
                {section.showPrices && (
                  <p className="mt-2 text-2xl font-bold tabular-nums">
                    {format.number(p.priceCents / 100, { style: "currency", currency: data.agency.currency })}
                    <span className="ml-1 text-sm font-normal opacity-60">{tu.has(p.unit as "hour") ? tu(p.unit as "hour") : ""}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
          {section.showPrices && <p className="mt-4 text-center text-sm opacity-60">{t("pricesIncludeVat")}</p>}
        </>,
      );
    case "pricing":
      return wrap(
        <>
          <Heading intro={section.intro} align={align}>
            {section.heading}
          </Heading>
          <div className={cn("grid items-stretch gap-5", columnClass[Math.max(2, section.items.length) as 2 | 3 | 4])}>
            {section.items.map((item, i) => (
              <div
                key={i}
                className={cn(
                  "relative flex flex-col gap-4 rounded-[var(--site-radius)] p-7",
                  item.highlighted ? "bg-[var(--site-primary)] text-[var(--site-on-primary)] shadow-2xl shadow-black/10 ring-2 ring-[var(--site-accent)] @4xl:-my-3 @4xl:py-10" : card,
                )}
              >
                {item.badge && <span className="absolute -top-3 left-7 rounded-full bg-[var(--site-accent)] px-3 py-1 text-xs font-semibold text-[var(--site-on-accent)]">{item.badge}</span>}
                <h3 className="text-lg font-semibold">{item.name}</h3>
                {item.price && (
                  <p className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight">{item.price}</span>
                    {item.period && <span className="text-sm opacity-70">{item.period}</span>}
                  </p>
                )}
                {item.description && <p className="text-sm opacity-75">{item.description}</p>}
                {item.features.trim() && (
                  <ul className="grid gap-2 text-sm">
                    {item.features
                      .split("\n")
                      .map((f) => f.trim())
                      .filter(Boolean)
                      .map((f, j) => (
                        <li key={j} className="flex items-start gap-2">
                          <CheckIcon className="mt-0.5 size-4 shrink-0 text-[var(--site-accent)]" aria-hidden />
                          {f}
                        </li>
                      ))}
                  </ul>
                )}
                {item.ctaLabel && (
                  <a href={target(section)} className={cn(button, "mt-auto w-full")}>
                    {item.ctaLabel}
                  </a>
                )}
              </div>
            ))}
          </div>
        </>,
      );
    case "reviews": {
      const items = data.reviews.items.slice(0, section.max);
      return wrap(
        <>
          <Heading intro={data.reviews.count ? t("reviewsSummary", { average: (data.reviews.average ?? 0).toFixed(1), count: data.reviews.count }) : undefined} align={align}>
            {section.heading}
          </Heading>
          {items.length === 0 ? (
            <p className="text-center opacity-60">{t("noReviews")}</p>
          ) : (
            <div className="grid gap-6 @3xl:grid-cols-3">
              {items.map((r) => (
                <figure key={r.id} className={cn("grid content-start gap-3 rounded-[var(--site-radius)] p-6", card)}>
                  <Stars rating={r.rating} label={t("stars", { rating: r.rating })} />
                  {r.comment && <blockquote className="opacity-85">“{r.comment}”</blockquote>}
                  {r.author && <figcaption className="text-sm font-semibold">{r.author}</figcaption>}
                </figure>
              ))}
            </div>
          )}
        </>,
      );
    }
    case "testimonials": {
      const person = (item: (typeof section.items)[number]) => (
        <figcaption className="flex items-center gap-3">
          {item.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- images agencies upload or link
            <img src={item.image} alt="" className="size-11 rounded-full object-cover" loading="lazy" />
          ) : item.author ? (
            <span className="flex size-11 items-center justify-center rounded-full bg-[color-mix(in_oklab,var(--site-accent)_18%,transparent)] font-semibold">{item.author.charAt(0)}</span>
          ) : null}
          <span className="grid text-sm">
            {item.author && <span className="font-semibold">{item.author}</span>}
            {item.role && <span className="opacity-65">{item.role}</span>}
          </span>
        </figcaption>
      );
      if (section.layout === "spotlight") {
        const [first, ...rest] = section.items;
        return wrap(
          <>
            <Heading align={align}>{section.heading}</Heading>
            <figure className="mx-auto grid max-w-3xl justify-items-center gap-6 text-center">
              {first!.rating > 0 && <Stars rating={first!.rating} label={t("stars", { rating: first!.rating })} />}
              <blockquote className="text-2xl leading-snug font-medium text-balance @xl:text-3xl">“{first!.quote}”</blockquote>
              {person(first!)}
            </figure>
            {rest.length > 0 && (
              <div className="mt-14 grid gap-6 @3xl:grid-cols-3">
                {rest.map((item, i) => (
                  <figure key={i} className={cn("grid content-between gap-4 rounded-[var(--site-radius)] p-6", card)}>
                    <blockquote className="opacity-85">“{item.quote}”</blockquote>
                    {person(item)}
                  </figure>
                ))}
              </div>
            )}
          </>,
        );
      }
      return wrap(
        <>
          <Heading align={align}>{section.heading}</Heading>
          <div className="grid gap-6 @3xl:grid-cols-2 @5xl:grid-cols-3">
            {section.items.map((item, i) => (
              <figure key={i} className={cn("grid content-between gap-5 rounded-[var(--site-radius)] p-6", card)}>
                <div className="grid gap-3">
                  {item.rating > 0 && <Stars rating={item.rating} label={t("stars", { rating: item.rating })} />}
                  <blockquote className="leading-relaxed opacity-90">“{item.quote}”</blockquote>
                </div>
                {person(item)}
              </figure>
            ))}
          </div>
        </>,
      );
    }
    case "gallery":
      return wrap(
        <>
          <Heading align={align}>{section.heading}</Heading>
          <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-3">
            {section.images.map((img, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- images agencies upload or link
              <img key={i} src={img.url} alt={img.alt} className="aspect-square w-full rounded-[var(--site-radius)] object-cover" loading="lazy" />
            ))}
          </div>
        </>,
      );
    case "logos":
      return wrap(
        <>
          <Heading align={align}>{section.heading}</Heading>
          <ul className="flex flex-wrap items-center justify-center gap-x-12 gap-y-8">
            {section.images.map((img, i) => (
              <li key={i}>
                {/* eslint-disable-next-line @next/next/no-img-element -- logos agencies upload */}
                <img src={img.url} alt={img.alt} className={cn("h-10 w-auto max-w-40 object-contain @xl:h-12", section.grayscale && "opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0")} loading="lazy" />
              </li>
            ))}
          </ul>
        </>,
      );
    case "team":
      return wrap(
        <>
          <Heading intro={section.intro} align={align}>
            {section.heading}
          </Heading>
          <ul className="grid gap-8 grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-4">
            {section.items.map((item, i) => (
              <li key={i} className="grid content-start gap-3 text-center">
                {item.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- images agencies upload or link
                  <img src={item.image} alt="" className="aspect-square w-full rounded-[var(--site-radius)] object-cover" loading="lazy" />
                ) : (
                  <span aria-hidden className="flex aspect-square w-full items-center justify-center rounded-[var(--site-radius)] bg-linear-135 from-[var(--site-primary)] to-[var(--site-accent)] text-4xl font-bold text-white/90">
                    {item.name.charAt(0)}
                  </span>
                )}
                <div className="grid gap-0.5">
                  <h3 className="font-semibold">{item.name}</h3>
                  {item.role && <p className="text-sm opacity-65">{item.role}</p>}
                  {item.bio && <p className="mt-1 text-sm opacity-80">{item.bio}</p>}
                </div>
              </li>
            ))}
          </ul>
        </>,
      );
    case "video": {
      const embed = mediaEmbed(section.url);
      return wrap(
        <>
          <Heading align={align}>{section.heading}</Heading>
          {embed ? (
            <div className="overflow-hidden rounded-[var(--site-radius)] bg-black">
              <iframe src={embed.embedUrl} title={section.heading || t("video")} className={cn("w-full", embed.provider === "soundcloud" || embed.provider === "mixcloud" ? "h-40" : "aspect-video")} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
            </div>
          ) : (
            <p className="text-center opacity-60">{t("videoUnsupported")}</p>
          )}
        </>,
        "narrow",
      );
    }
    case "faq":
      return wrap(
        <>
          <Heading align={align}>{section.heading}</Heading>
          <div className="grid gap-3">
            {section.items.map((item, i) => (
              <details key={i} className={cn("group rounded-[var(--site-radius)] p-5", card)}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span aria-hidden className="text-xl leading-none opacity-60 transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 whitespace-pre-line opacity-80">{item.a}</p>
              </details>
            ))}
          </div>
        </>,
        "narrow",
      );
    case "banner":
      return (
        <section id={section.id} className={cn("relative isolate overflow-hidden", backgrounds[section.background])}>
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-5 gap-y-3 px-4 py-5 text-center @xl:px-6">
            {section.icon && <SiteIconView value={section.icon} className="size-5 text-xl" />}
            <p className="font-medium text-balance">{section.text}</p>
            {section.ctaLabel && (
              <a href={target(section)} className="text-sm font-semibold underline underline-offset-4 hover:no-underline">
                {section.ctaLabel} →
              </a>
            )}
          </div>
        </section>
      );
    case "divider":
      return (
        <div id={section.id} aria-hidden className={cn(backgrounds[section.background], section.style === "space" ? "h-16" : "py-6")}>
          {section.style === "line" && <div className="mx-auto h-px w-full max-w-6xl bg-[var(--site-border)]" />}
          {section.style === "dots" && (
            <div className="flex justify-center gap-3">
              {[0, 1, 2].map((i) => (
                <span key={i} className="size-1.5 rounded-full bg-[var(--site-accent)]" />
              ))}
            </div>
          )}
          {section.style === "wave" && (
            <svg viewBox="0 0 1200 40" preserveAspectRatio="none" className="h-8 w-full text-[var(--site-accent)]">
              <path d="M0 20 Q 75 0 150 20 T 300 20 T 450 20 T 600 20 T 750 20 T 900 20 T 1050 20 T 1200 20" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          )}
        </div>
      );
    case "cta":
      return wrap(
        <div className="grid justify-items-center gap-5 text-center">
          <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-balance @xl:text-5xl">{section.heading}</h2>
          {section.body && <p className="max-w-xl text-lg opacity-80">{section.body}</p>}
          {section.ctaLabel && (
            <a href={target(section)} className={cn(button, "mt-2")}>
              {section.ctaLabel}
            </a>
          )}
        </div>,
      );
    case "booking":
      return wrap(
        <>
          <Heading intro={section.intro} align={align}>
            {section.heading}
          </Heading>
          {/* The form keeps StageDesk's light form styling, whatever the page looks like. */}
          <div className="light rounded-[calc(var(--site-radius)*1.5)] border border-black/10 bg-white p-6 text-neutral-900 shadow-sm @xl:p-10">
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
        "narrow",
      );
    case "contact": {
      const a = data.agency;
      const address = [a.addressLine, [a.postalCode, a.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
      const tile = cn("grid justify-items-center gap-2 rounded-[var(--site-radius)] p-6 text-center", card);
      return wrap(
        <>
          <Heading intro={section.intro} align={align}>
            {section.heading}
          </Heading>
          <div className="mx-auto grid max-w-3xl gap-4 @xl:grid-cols-3">
            {a.contactEmail && (
              <a href={`mailto:${a.contactEmail}`} className={tile}>
                <MailIcon className="size-6 text-[var(--site-accent)]" aria-hidden />
                <span className="text-sm break-all">{a.contactEmail}</span>
              </a>
            )}
            {a.phone && (
              <a href={`tel:${a.phone.replace(/\s+/g, "")}`} className={tile}>
                <PhoneIcon className="size-6 text-[var(--site-accent)]" aria-hidden />
                <span className="text-sm">{a.phone}</span>
              </a>
            )}
            {address && (
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noopener" className={tile}>
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
