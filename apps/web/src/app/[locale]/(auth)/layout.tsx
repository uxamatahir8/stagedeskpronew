import { ArrowLeftIcon, CheckIcon } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { Screenshot } from "@/components/site/screenshot";
import { LocaleSwitch } from "@/components/site/site-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

/**
 * Sign-in, sign-up and the other account pages: the product on the left (on
 * wide screens), the form on the right with language and theme at hand.
 */
export default async function AuthLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("auth");
  const en = locale === "en";

  return (
    <div className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-[oklch(0.24_0.08_322)] text-white lg:flex lg:flex-col">
        <div className="relative z-10 grid gap-10 p-12 xl:p-16">
          <Link href="/" className="w-fit" aria-label="StageDesk Pro">
            <Logo onDark className="h-11" priority />
          </Link>
          <div className="grid max-w-md gap-6">
            <p className="text-3xl leading-tight font-semibold text-balance">{t("brandLine")}</p>
            <ul className="grid gap-3 text-white/80">
              {(["brandPoint1", "brandPoint2", "brandPoint3"] as const).map((k) => (
                <li key={k} className="flex gap-3">
                  <CheckIcon className="mt-0.5 size-5 shrink-0 text-[oklch(0.78_0.15_352)]" aria-hidden />
                  {t(k)}
                </li>
              ))}
            </ul>
          </div>
        </div>
        {/* The artist app, tilted slightly and cut off by the bottom edge, like a phone on a table.
            It has its own space under the text, so it never covers the headline or the list. */}
        <div aria-hidden className="pointer-events-none relative mt-auto h-[clamp(12rem,38svh,24rem)] shrink-0">
          <div className="absolute top-6 right-10 w-[17rem] rotate-[-6deg] xl:right-16 xl:w-[19rem]">
            <Screenshot name="artist" />
          </div>
        </div>
      </aside>

      <div className="flex min-h-svh flex-col">
        <div className="flex items-center justify-between gap-2 px-4 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeftIcon className="size-4" aria-hidden />
            <span className="hidden sm:inline">{t("backToSite")}</span>
            <Logo className="h-8 sm:hidden" />
          </Link>
          <div className="flex items-center gap-1">
            <LocaleSwitch />
            <ThemeToggle />
          </div>
        </div>
        <main className="flex flex-1 flex-col items-center justify-center px-4 pb-12">{children}</main>
        <footer className="flex flex-wrap justify-center gap-x-5 gap-y-1 px-4 pb-6 text-xs text-muted-foreground">
          <Link href={en ? "/terms" : "/algemene-voorwaarden"} className="hover:text-foreground">
            {t("terms")}
          </Link>
          <Link href={en ? "/privacy-policy" : "/privacy"} className="hover:text-foreground">
            {t("privacy")}
          </Link>
          <Link href="/help" className="hover:text-foreground">
            {t("help")}
          </Link>
        </footer>
      </div>
    </div>
  );
}
