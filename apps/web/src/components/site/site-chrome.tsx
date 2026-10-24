import { connection } from "next/server";
import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { displayCurrency } from "@/lib/display-currency";
import { CurrencySwitch } from "./currency-switch";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { sitePages, siteSettings } from "@/lib/site";
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

async function FooterColumns() {
  await connection();
  const [t, locale, pages] = await Promise.all([getTranslations("site"), getLocale(), sitePages()]);
  const placed = (placement: string) =>
    pages.filter((p) => p.placement === placement).map((p) => ({ href: `/${locale === "en" ? p.slugEn : p.slugNl}`, label: locale === "en" ? p.titleEn : p.titleNl }));
  const columns = [
    {
      title: t("footer.product"),
      links: [
        { href: "/features", label: t("nav.features") },
        { href: "/tour", label: t("nav.tour") },
        ...featurePages.map((slug) => ({ href: `/features/${slug}`, label: t(`nav.feature_${slug}`) })),
        { href: "/pricing", label: t("nav.pricing") },
        { href: "/changelog", label: t("nav.changelog") },
        ...placed("footer_product"),
      ],
    },
    {
      title: t("footer.company"),
      links: [
        { href: "/about", label: t("nav.about") },
        { href: "/for-agencies", label: t("nav.forAgencies") },
        { href: "/solutions/weddings-events", label: t("nav.weddingsEvents") },
        { href: "/solutions/band-agencies", label: t("nav.bandAgencies") },
        { href: "/request", label: t("nav.request") },
        { href: "/for-artists", label: t("nav.forArtists") },
        ...placed("footer_company"),
        { href: "/blog", label: t("nav.blog") },
        { href: "/help", label: t("nav.help") },
        { href: "/partners", label: t("nav.partners") },
        { href: "/contact", label: t("nav.contact") },
      ],
    },
    { title: t("footer.legal"), links: placed("footer_legal") },
  ].filter((c) => c.links.length > 0);

  return (
    <div className="grid gap-8 sm:grid-cols-3">
      {columns.map((c) => (
        <div key={c.title} className="grid content-start gap-3">
          <h2 className="text-sm font-semibold">{c.title}</h2>
          <ul className="grid gap-2 text-sm text-muted-foreground">
            {c.links.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:text-foreground">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export async function SiteFooter() {
  const t = await getTranslations("site");
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto grid w-full max-w-[88rem] gap-10 px-5 py-12 sm:px-8 lg:px-12 md:grid-cols-[1fr_2fr]">
        <div className="grid content-start gap-3">
          <Link href="/" className="w-fit" aria-label="StageDesk Pro">
            <Logo className="h-11" />
          </Link>
          <p className="max-w-xs text-sm text-muted-foreground">{t("footer.tagline")}</p>
        </div>
        <Suspense fallback={<div className="h-40" />}>
          <FooterColumns />
        </Suspense>
      </div>
      <div className="mx-auto w-full max-w-[88rem] border-t px-5 py-6 text-xs text-muted-foreground sm:px-8 lg:px-12">{t("footer.madeIn")}</div>
    </footer>
  );
}
