import { MailIcon, MapPinIcon, PhoneIcon } from "lucide-react";
import { connection } from "next/server";
import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { displayCurrency } from "@/lib/display-currency";
import { CurrencySwitch } from "./currency-switch";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { siteFooter, sitePages, siteSettings } from "@/lib/site";
import { LocaleSwitch, MobileNav, type NavEntry, NavLinks } from "./site-nav";

/** The primary call to action: start a trial, or join the waitlist before launch. */
export async function primaryCta() {
  const [t, { site }] = await Promise.all([getTranslations("site"), siteSettings()]);
  return site.waitlistMode ? { href: "/#waitlist", label: t("joinWaitlist") } : { href: "/sign-up", label: t("startTrial") };
}

/** Feature and solution pages, shared by the header menus and the footer. */
export const featurePages = ["booking-page", "quotes-invoices", "payments-payouts", "artist-management"] as const;
const featureIcons = { "booking-page": "globe", "quotes-invoices": "file", "payments-payouts": "coins", "artist-management": "music" } as const;

async function navEntries(): Promise<NavEntry[]> {
  const [t, locale, pages] = await Promise.all([getTranslations("site"), getLocale(), sitePages()]);
  return [
    {
      label: t("nav.product"),
      children: [
        { href: "/features", label: t("nav.features"), description: t("nav.featuresHint"), icon: "grid" },
        { href: "/tour", label: t("nav.tour"), description: t("nav.tourHint"), icon: "sparkles" },
        ...featurePages.map((slug) => ({ href: `/features/${slug}`, label: t(`nav.feature_${slug}`), description: t(`nav.feature_${slug}Hint`), icon: featureIcons[slug] })),
      ],
    },
    {
      label: t("nav.solutions"),
      children: [
        { href: "/for-agencies", label: t("nav.forAgencies"), description: t("nav.forAgenciesHint"), icon: "users" },
        { href: "/solutions/weddings-events", label: t("nav.weddingsEvents"), description: t("nav.weddingsEventsHint"), icon: "heart" },
        { href: "/solutions/band-agencies", label: t("nav.bandAgencies"), description: t("nav.bandAgenciesHint"), icon: "calendar" },
        { href: "/request", label: t("nav.request"), description: t("nav.requestHint"), icon: "sparkles" },
        { href: "/for-artists", label: t("nav.forArtists"), description: t("nav.forArtistsHint"), icon: "music" },
      ],
    },
    { href: "/pricing", label: t("nav.pricing") },
    {
      label: t("nav.resources"),
      children: [
        { href: "/blog", label: t("nav.blog"), description: t("nav.blogHint"), icon: "book" },
        { href: "/help", label: t("nav.help"), description: t("nav.helpHint"), icon: "help" },
        { href: "/changelog", label: t("nav.changelog"), description: t("nav.changelogHint"), icon: "sparkles" },
        { href: "/partners", label: t("nav.partners"), description: t("nav.partnersHint"), icon: "handshake" },
        { href: "/contact", label: t("nav.contact"), description: t("nav.contactHint"), icon: "mail" },
      ],
    },
    { href: "/about", label: t("nav.about") },
    { href: "/contact", label: t("nav.contact") },
    ...pages.filter((p) => p.placement === "header").map((p) => ({ href: `/${locale === "en" ? p.slugEn : p.slugNl}`, label: locale === "en" ? p.titleEn : p.titleNl })),
  ];
}

async function HeaderActions() {
  await connection();
  const [t, entries, cta, currency] = await Promise.all([getTranslations("site"), navEntries(), primaryCta(), displayCurrency()]);
  return (
    <>
      <NavLinks entries={entries} />
      <div className="ml-auto flex items-center gap-1">
        <LocaleSwitch />
        <CurrencySwitch current={currency} />
        <ThemeToggle />
        <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
          <Link href="/sign-in">{t("signIn")}</Link>
        </Button>
        <Button asChild size="sm" className="hidden sm:inline-flex">
          <Link href={cta.href}>{cta.label}</Link>
        </Button>
        <MobileNav entries={entries} signIn={t("signIn")} cta={cta} />
      </div>
    </>
  );
}

export function SiteHeader() {
  return (
    <header className="site-header sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[88rem] items-center gap-4 px-5 sm:px-8 lg:px-12">
        <Link href="/" className="shrink-0" aria-label="StageDesk Pro">
          <Logo className="h-9" priority />
        </Link>
        <Suspense fallback={<div className="ml-auto h-8 w-40" />}>
          <HeaderActions />
        </Suspense>
      </div>
    </header>
  );
}

/** The footer's link columns, from the admin panel, with builder pages placed in them. */
async function FooterColumns() {
  await connection();
  const [locale, pages, { columns }] = await Promise.all([getLocale(), sitePages(), siteFooter()]);
  const en = locale === "en";
  const list = columns
    .map((c) => ({
      id: c.id,
      title: en ? c.titleEn : c.titleNl,
      links: [
        ...c.links.map((l) => ({ key: l.id, href: l.target, external: l.kind === "url", newTab: l.newTab, label: en ? l.labelEn : l.labelNl })),
        ...pages
          .filter((p) => p.placement === `footer_${c.id}`)
          .map((p) => ({ key: p.id, href: `/${en ? p.slugEn : p.slugNl}`, external: false, newTab: false, label: en ? p.titleEn : p.titleNl })),
      ],
    }))
    .filter((c) => c.links.length > 0);

  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">
      {list.map((c) => (
        <div key={c.id} className="grid content-start gap-3">
          <h2 className="text-sm font-semibold">{c.title}</h2>
          <ul className="grid gap-2 text-sm text-muted-foreground">
            {c.links.map((l) => (
              <li key={l.key}>
                {l.external ? (
                  <a href={l.href} className="hover:text-foreground" {...(l.newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                    {l.label}
                  </a>
                ) : (
                  <Link href={l.href} className="hover:text-foreground">
                    {l.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

const socialNames = { instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", youtube: "YouTube", tiktok: "TikTok", x: "X" } as const;

/** Tagline, contact details and social links from the footer settings. */
async function FooterBrand() {
  await connection();
  const [locale, { settings }] = await Promise.all([getLocale(), siteFooter()]);
  const en = locale === "en";
  const socials = (Object.keys(socialNames) as (keyof typeof socialNames)[]).filter((k) => /^https:\/\//.test(settings.socials[k]));
  return (
    <>
      <p className="max-w-xs text-sm text-muted-foreground">{en ? settings.taglineEn : settings.taglineNl}</p>
      <ul className="grid gap-1.5 text-sm text-muted-foreground">
        {settings.email && (
          <li className="flex items-center gap-2">
            <MailIcon className="size-4 shrink-0" aria-hidden />
            <a href={`mailto:${settings.email}`} className="hover:text-foreground">
              {settings.email}
            </a>
          </li>
        )}
        {settings.phone && (
          <li className="flex items-center gap-2">
            <PhoneIcon className="size-4 shrink-0" aria-hidden />
            <a href={`tel:${settings.phone.replace(/[^+\d]/g, "")}`} className="hover:text-foreground">
              {settings.phone}
            </a>
          </li>
        )}
        {settings.address && (
          <li className="flex items-center gap-2">
            <MapPinIcon className="size-4 shrink-0" aria-hidden />
            {settings.address}
          </li>
        )}
      </ul>
      {socials.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {socials.map((k) => (
            <li key={k}>
              <a href={settings.socials[k]} target="_blank" rel="noopener noreferrer" className="inline-flex rounded-full border bg-background px-3 py-1 text-xs font-medium hover:border-primary/50 hover:text-primary">
                {socialNames[k]}
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** The bottom line: copyright, company numbers and the footer text. */
async function FooterBottom() {
  await connection();
  const [t, locale, { settings }, { site }] = await Promise.all([getTranslations("site"), getLocale(), siteFooter(), siteSettings()]);
  const en = locale === "en";
  const parts = [
    `© ${new Date().getFullYear()} ${site.siteName}`,
    settings.kvkNumber ? `${t("footer.kvk")} ${settings.kvkNumber}` : null,
    settings.vatNumber ? `${t("footer.vat")} ${settings.vatNumber}` : null,
    (en ? settings.bottomEn : settings.bottomNl) || null,
  ].filter(Boolean);
  return <p>{parts.join(" · ")}</p>;
}

export async function SiteFooter() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto grid w-full max-w-[88rem] gap-12 px-5 py-14 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.6fr)] lg:px-12">
        <div className="grid content-start gap-4">
          <Link href="/" className="w-fit" aria-label="StageDesk Pro">
            <Logo className="h-11" />
          </Link>
          <Suspense fallback={<div className="h-24" />}>
            <FooterBrand />
          </Suspense>
        </div>
        <Suspense fallback={<div className="h-40" />}>
          <FooterColumns />
        </Suspense>
      </div>
      <div className="mx-auto flex w-full max-w-[88rem] flex-wrap items-center justify-between gap-3 border-t px-5 py-6 text-xs text-muted-foreground sm:px-8 lg:px-12">
        <Suspense fallback={null}>
          <FooterBottom />
        </Suspense>
      </div>
    </footer>
  );
}
