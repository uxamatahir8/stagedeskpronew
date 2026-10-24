import {
  ArrowRightIcon,
  BellRingIcon,
  CalendarCheckIcon,
  FileDownIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  GlobeIcon,
  HandCoinsIcon,
  HandshakeIcon,
  InboxIcon,
  LanguagesIcon,
  LayoutTemplateIcon,
  LineChartIcon,
  type LucideIcon,
  Music2Icon,
  ShieldCheckIcon,
  StarIcon,
  UserRoundIcon,
  UsersIcon,
} from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { container, CtaBand, FeatureRow, SectionHeading } from "@/components/site/marketing-blocks";
import { MockQuote } from "@/components/site/mockups";
import { Screenshot } from "@/components/site/screenshot";
import { primaryCta } from "@/components/site/site-chrome";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/features">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "featuresPage" });
  return pageMetadata({ locale, title: t("title"), description: t("intro"), paths: { nl: "/features", en: "/features" }, kicker: t("eyebrow") });
}

type MainKey = "bookingPage" | "quotes" | "planning" | "artists" | "payments";
type MinorKey = "communication" | "team" | "insights" | "security";

/** The five main areas, each with a picture and (most) with a page of their own. */
const main: { key: MainKey; icon: LucideIcon; points: number; detail?: string; visual: ReactNode }[] = [
  { key: "bookingPage", icon: GlobeIcon, points: 4, detail: "booking-page", visual: <Screenshot name="booking-page" /> },
  {
    key: "quotes",
    icon: FileTextIcon,
    points: 4,
    detail: "quotes-invoices",
    visual: (
      <div className="mx-auto max-w-lg">
        <MockQuote />
      </div>
    ),
  },
  { key: "planning", icon: CalendarCheckIcon, points: 3, visual: <Screenshot name="calendar" /> },
  { key: "artists", icon: Music2Icon, points: 4, detail: "artist-management", visual: <Screenshot name="artist" className="mx-auto max-w-[17rem]" /> },
  { key: "payments", icon: HandCoinsIcon, points: 4, detail: "payments-payouts", visual: <Screenshot name="payments" /> },
];

const minor: { key: MinorKey; icon: LucideIcon; points: number }[] = [
  { key: "communication", icon: BellRingIcon, points: 3 },
  { key: "team", icon: UsersIcon, points: 3 },
  { key: "insights", icon: LineChartIcon, points: 3 },
  { key: "security", icon: ShieldCheckIcon, points: 3 },
];

const also: { key: "website" | "leads" | "portal" | "reviews" | "languages" | "pdf" | "export" | "partners"; icon: LucideIcon }[] = [
  { key: "website", icon: LayoutTemplateIcon },
  { key: "leads", icon: InboxIcon },
  { key: "portal", icon: UserRoundIcon },
  { key: "reviews", icon: StarIcon },
  { key: "languages", icon: LanguagesIcon },
  { key: "pdf", icon: FileDownIcon },
  { key: "export", icon: FileSpreadsheetIcon },
  { key: "partners", icon: HandshakeIcon },
];

export default async function FeaturesPage({ params }: PageProps<"/[locale]/features">) {
  setRequestLocale((await params).locale as Locale);
  const [t, ts] = await Promise.all([getTranslations("featuresPage"), getTranslations("site")]);
  return (
    <main>
      <section className="border-b">
        <div className={`${container} grid gap-12 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center lg:py-24`}>
          <div className="grid content-start gap-6">
            <p className="text-sm font-medium text-primary">{t("eyebrow")}</p>
            <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-[3.3rem] lg:leading-[1.05]">{t("title")}</h1>
            <p className="max-w-xl text-lg text-muted-foreground">{t("intro")}</p>
            <Suspense fallback={<Skeleton className="h-11 w-72" />}>
              <HeroActions />
            </Suspense>
          </div>
          <Screenshot name="hero-collage" priority className="rounded-2xl" />
        </div>
      </section>

      {/* Jump links that stay in view under the header while reading. */}
      <nav aria-label={t("jumpTo")} className="sticky top-16 z-20 border-b bg-background/90 backdrop-blur">
        <ul className={`${container} flex gap-1 overflow-x-auto py-2.5 text-sm [mask-image:linear-gradient(to_right,transparent,black_1rem,black_calc(100%-1rem),transparent)] [scrollbar-width:none] lg:flex-wrap lg:justify-center lg:[mask-image:none] [&::-webkit-scrollbar]:hidden`}>
          {[...main, ...minor].map(({ key, icon: Icon }) => (
            <li key={key} className="shrink-0">
              <a href={`#${key}`} className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <Icon className="size-4" aria-hidden />
                {t(`${key}.title`)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className={`${container} grid gap-24 py-20`}>
        {main.map(({ key, points, detail, visual }, i) => (
          <section key={key} id={key} className="scroll-mt-32">
            <FeatureRow
              title={t(`${key}.title`)}
              body={t(`${key}.body`)}
              points={Array.from({ length: points }, (_, n) => t(`${key}.p${n + 1}` as "quotes.p1"))}
              visual={visual}
              reverse={i % 2 === 1}
              link={detail ? { href: `/features/${detail}`, label: t("learnMore") } : undefined}
            />
          </section>
        ))}
      </div>

      <section className="border-y bg-muted/30">
        <div className={`${container} grid gap-6 py-20 md:grid-cols-2`}>
          {minor.map(({ key, icon: Icon, points }) => (
            <article key={key} id={key} className="grid scroll-mt-32 content-start gap-3 rounded-2xl border bg-card p-6 sm:p-8">
              <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <h2 className="text-xl font-semibold">{t(`${key}.title`)}</h2>
              <p className="text-muted-foreground">{t(`${key}.body`)}</p>
              <ul className="grid gap-1.5 text-sm">
                {Array.from({ length: points }, (_, n) => (
                  <li key={n} className="flex gap-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                    {t(`${key}.p${n + 1}` as "team.p1")}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className={`${container} grid gap-10 py-20`}>
        <SectionHeading title={t("alsoTitle")} intro={t("alsoIntro")} />
        <ul className="grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {also.map(({ key, icon: Icon }) => (
            <li key={key} className="grid content-start gap-2">
              <Icon className="size-5 text-primary" aria-hidden />
              <h3 className="font-semibold">{t(`also_${key}`)}</h3>
              <p className="text-sm text-muted-foreground">{t(`also_${key}Body`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <Suspense fallback={null}>
        <CtaBand title={t("ctaTitle")} body={t("ctaBody")} secondary={{ href: "/pricing", label: ts("nav.pricing") }} />
      </Suspense>
    </main>
  );
}

async function HeroActions() {
  await connection();
  const [t, cta] = await Promise.all([getTranslations("featuresPage"), primaryCta()]);
  return (
    <div className="flex flex-wrap gap-3">
      <Button asChild size="lg">
        <Link href={cta.href}>
          {cta.label}
          <ArrowRightIcon />
        </Link>
      </Button>
      <Button asChild size="lg" variant="outline">
        <Link href="/tour">{t("tourLink")}</Link>
      </Button>
    </div>
  );
}
