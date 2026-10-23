import { connection } from "next/server";
import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { sitePages, siteSettings } from "@/lib/site";
import { LocaleSwitch, MobileNav, type NavLink, NavLinks } from "./site-nav";

/** The primary call to action: start a trial, or join the waitlist before launch. */
export async function primaryCta() {
  const [t, { site }] = await Promise.all([getTranslations("site"), siteSettings()]);
  return site.waitlistMode ? { href: "/#waitlist", label: t("joinWaitlist") } : { href: "/sign-up", label: t("startTrial") };
}

async function navLinks(): Promise<NavLink[]> {
  const [t, locale, pages] = await Promise.all([getTranslations("site"), getLocale(), sitePages()]);
  return [
    { href: "/features", label: t("nav.features") },
    { href: "/pricing", label: t("nav.pricing") },
    { href: "/for-agencies", label: t("nav.forAgencies") },
    { href: "/for-artists", label: t("nav.forArtists") },
    { href: "/blog", label: t("nav.blog") },
    { href: "/help", label: t("nav.help") },
    ...pages.filter((p) => p.placement === "header").map((p) => ({ href: `/${locale === "en" ? p.slugEn : p.slugNl}`, label: locale === "en" ? p.titleEn : p.titleNl })),
  ];
}

async function HeaderActions() {
  await connection();
  const [t, links, cta] = await Promise.all([getTranslations("site"), navLinks(), primaryCta()]);
  return (
    <>
      <NavLinks links={links} />
      <div className="ml-auto flex items-center gap-1">
        <LocaleSwitch />
        <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
          <Link href="/sign-in">{t("signIn")}</Link>
        </Button>
        <Button asChild size="sm" className="hidden sm:inline-flex">
          <Link href={cta.href}>{cta.label}</Link>
        </Button>
        <MobileNav links={links} signIn={t("signIn")} cta={cta} />
      </div>
    </>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">S</span>
          StageDesk
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
        { href: "/pricing", label: t("nav.pricing") },
        { href: "/changelog", label: t("nav.changelog") },
        { href: "/help", label: t("nav.help") },
        ...placed("footer_product"),
      ],
    },
    {
      title: t("footer.company"),
      links: [
        ...placed("footer_company"),
        { href: "/blog", label: t("nav.blog") },
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
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1fr_2fr]">
        <div className="grid content-start gap-3">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">S</span>
            StageDesk
          </Link>
          <p className="max-w-xs text-sm text-muted-foreground">{t("footer.tagline")}</p>
        </div>
        <Suspense fallback={<div className="h-40" />}>
          <FooterColumns />
        </Suspense>
      </div>
      <div className="mx-auto w-full max-w-6xl border-t px-4 py-6 text-xs text-muted-foreground sm:px-6">{t("footer.madeIn")}</div>
    </footer>
  );
}
