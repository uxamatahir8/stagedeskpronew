import { ArrowRightIcon, CalendarCheckIcon, CheckIcon, FileTextIcon, GlobeIcon, HandCoinsIcon, MessagesSquareIcon, Music2Icon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { splitBookingPayment } from "@stagedesk/core";
import { BeforeAfter, CapabilityFigures, EventTypes, HubDiagram, JourneyFlow, TrustStrip } from "@/components/site/infographics";
import { Screenshot } from "@/components/site/screenshot";
import { MockArtistRequest, MockPayout, MockQuote } from "@/components/site/mockups";
import { primaryCta } from "@/components/site/site-chrome";
import { WaitlistForm } from "@/components/site/waitlist-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { euro, percent } from "@/lib/format";
import { jsonLd, pageMetadata } from "@/lib/seo";
import { sitePlans, siteSettings } from "@/lib/site";
import { turnstileSiteKey } from "@/lib/turnstile";

export async function generateMetadata({ params }: PageProps<"/[locale]">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "landing" });
  return pageMetadata({ locale, title: t("metaTitle"), description: t("metaDescription"), paths: { nl: "/", en: "/" } });
}

const features = [
  { key: "inquiries", icon: GlobeIcon },
  { key: "quotes", icon: FileTextIcon },
  { key: "planning", icon: CalendarCheckIcon },
  { key: "artists", icon: Music2Icon },
  { key: "payments", icon: HandCoinsIcon },
  { key: "messages", icon: MessagesSquareIcon },
] as const;

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  setRequestLocale((await params).locale as Locale);
  const t = await getTranslations("landing");

  return (
    <main>
      <section className="relative overflow-hidden border-b">
        <div className="relative mx-auto grid w-full max-w-[88rem] gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.15fr)] lg:items-center lg:py-24 lg:pr-0 lg:pl-12">
          <div className="grid gap-6">
            <p className="text-sm font-medium text-primary">{t("eyebrow")}</p>
            <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-[3.4rem] lg:leading-[1.05]">
              {t.rich("title", { hl: (chunks) => <span className="text-brand-gradient">{chunks}</span> })}
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">{t("intro")}</p>
            <Suspense fallback={<Skeleton className="h-11 w-72" />}>
              <HeroActions />
            </Suspense>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              {(["point1", "point2", "point3"] as const).map((k) => (
                <li key={k} className="flex items-center gap-1.5">
                  <CheckIcon className="size-4 text-success" aria-hidden />
                  {t(k)}
                </li>
              ))}
            </ul>
          </div>
          {/* The real dashboard (demo data), running off the right edge on wide screens. */}
          <div className="relative lg:-mr-24 xl:-mr-40">
            <Screenshot name="dashboard" priority className="rounded-xl shadow-[0_30px_80px_-40px_rgb(40_10_50/0.55)] lg:rounded-r-none" />
          </div>
        </div>
        <div className="relative border-t bg-background/60 py-5">
          <div className="mx-auto w-full max-w-[88rem] px-5 sm:px-8 lg:px-12">
            <TrustStrip />
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-[88rem] gap-10 px-5 py-20 sm:px-8 lg:px-12">
        <div className="grid max-w-2xl gap-3">
          <h2 className="text-3xl font-bold tracking-tight text-balance">{t("featuresTitle")}</h2>
          <p className="text-lg text-muted-foreground">{t("featuresIntro")}</p>
        </div>
        <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ key, icon: Icon }) => (
            <div key={key} className="grid content-start gap-2">
              <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-2 font-semibold">{t(`feature_${key}`)}</h3>
              <p className="text-muted-foreground">{t(`feature_${key}Body`)}</p>
            </div>
          ))}
        </div>
        <Button asChild variant="outline" className="w-fit">
          <Link href="/features">
            {t("allFeatures")}
            <ArrowRightIcon />
          </Link>
        </Button>
      </section>

      <section className="border-y bg-muted/30">
        <div className="mx-auto w-full max-w-[88rem] px-5 py-20 sm:px-8 lg:px-12">
          <JourneyFlow />
        </div>
      </section>

      <LookInside />

      <Showcase />

      <section className="border-y bg-muted/30">
        <div className="mx-auto grid w-full max-w-[88rem] gap-12 px-5 py-20 sm:px-8 lg:px-12 lg:grid-cols-2 lg:items-center">
          <div className="grid gap-4">
            <h2 className="text-3xl font-bold tracking-tight text-balance">{t("moneyTitle")}</h2>
            <p className="text-lg text-muted-foreground">{t("moneyIntro")}</p>
            <ol className="grid gap-3">
              {(["money1", "money2", "money3"] as const).map((k, i) => (
                <li key={k} className="grid grid-cols-[2rem_1fr] gap-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground tabular-nums">{i + 1}</span>
                  <span className="pt-1">{t(k)}</span>
                </li>
              ))}
            </ol>
          </div>
          <Suspense fallback={<Skeleton className="h-72 w-full" />}>
            <MoneySplit />
          </Suspense>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[88rem] px-5 py-20 sm:px-8 lg:px-12">
        <HubDiagram />
      </section>

      <section className="border-y bg-muted/30">
        <div className="mx-auto grid w-full max-w-[88rem] gap-16 px-5 py-20 sm:px-8 lg:px-12">
          <BeforeAfter />
          <CapabilityFigures />
          <EventTypes />
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-[88rem] gap-10 px-5 py-20 sm:px-8 lg:px-12">
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <PricingTeaser />
        </Suspense>
      </section>

      <section className="border-t bg-muted/30">
        <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-20 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight">{t("faqTitle")}</h2>
          <Faq />
        </div>
      </section>

      <Suspense fallback={null}>
        <ClosingCta />
      </Suspense>
    </main>
  );
}

async function HeroActions() {
  await connection();
  const [t, cta, { site }] = await Promise.all([getTranslations("landing"), primaryCta(), siteSettings()]);
  if (site.waitlistMode) return <WaitlistForm turnstileKey={turnstileSiteKey()} />;
  return (
    <div className="flex flex-wrap gap-3">
      <Button asChild size="lg">
        <Link href={cta.href}>
          {cta.label}
          <ArrowRightIcon />
        </Link>
      </Button>
      <Button asChild size="lg" variant="outline">
        <Link href="/pricing">{t("seePricing")}</Link>
      </Button>
    </div>
  );
}

/** A €1,500 booking split with the platform fee as it is configured right now. */
async function MoneySplit() {
  await connection();
  const [t, format, { fees }] = await Promise.all([getTranslations("landing"), getFormatter(), siteSettings()]);
  const amount = 150_000;
  const shareBps = 4_000;
  const split = splitBookingPayment({ amount, stripeFee: 0, artistShareBps: shareBps, feeRule: fees.defaultRule, stripeFeePaidBy: fees.stripeFeePaidBy });
  const rows = [
    { label: t("splitArtist", { pct: percent(format, shareBps) }), value: split.artist, tone: "bg-[var(--chart-2)]" },
    { label: t("splitAgency"), value: split.agency, tone: "bg-[var(--chart-1)]" },
    { label: t("splitPlatform"), value: split.platform, tone: "bg-muted-foreground/40" },
  ];
  return (
    <div className="grid gap-5 rounded-2xl border bg-card p-6">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{t("splitTitle")}</span>
        <span className="text-2xl font-semibold tabular-nums">{euro(format, amount)}</span>
      </div>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {rows.map((r) => (
          <span key={r.label} className={r.tone} style={{ width: `${(r.value / amount) * 100}%` }} />
        ))}
      </div>
      <dl className="grid gap-2 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-2 text-muted-foreground">
              <span className={`size-2.5 rounded-sm ${r.tone}`} aria-hidden />
              {r.label}
            </dt>
            <dd className="font-medium tabular-nums">{euro(format, r.value)}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">{t("splitNote")}</p>
    </div>
  );
}

async function PricingTeaser() {
  await connection();
  const [t, format, plans] = await Promise.all([getTranslations("landing"), getFormatter(), sitePlans()]);
  const cheapest = plans.reduce<number | null>((min, p) => (min === null || p.monthlyPriceCents < min ? p.monthlyPriceCents : min), null);
  const trial = Math.max(0, ...plans.map((p) => p.trialDays));
  return (
    <div className="grid gap-6 rounded-3xl border bg-card p-8 sm:p-12 lg:grid-cols-[1fr_auto] lg:items-center">
      <div className="grid gap-3">
        <h2 className="text-3xl font-bold tracking-tight text-balance">{t("pricingTitle")}</h2>
        <p className="text-lg text-muted-foreground">
          {cheapest !== null ? t("pricingIntro", { price: euro(format, cheapest), days: trial }) : t("pricingIntroNoPlans")}
        </p>
      </div>
      <Button asChild size="lg" className="w-fit">
        <Link href="/pricing">
          {t("seePricing")}
          <ArrowRightIcon />
        </Link>
      </Button>
    </div>
  );
}

async function Faq() {
  const t = await getTranslations("landing");
  const items = (["faq1", "faq2", "faq3", "faq4", "faq5", "faq6", "faq7", "faq8"] as const).map((k) => ({ q: t(`${k}Q`), a: t(`${k}A`) }));
  return (
    <>
      <div className="divide-y rounded-xl border bg-card">
        {items.map((item) => (
          <details key={item.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
              {item.q}
              <span className="text-muted-foreground transition-transform group-open:rotate-45" aria-hidden>
                +
              </span>
            </summary>
            <p className="mt-3 text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd({ "@type": "FAQPage", mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })) })}
      />
    </>
  );
}

async function ClosingCta() {
  await connection();
  const [t, cta, { site }] = await Promise.all([getTranslations("landing"), primaryCta(), siteSettings()]);
  return (
    <section id="waitlist" className="mx-auto w-full max-w-[88rem] px-5 py-20 sm:px-8 lg:px-12">
      <div className="grid gap-6 rounded-3xl bg-brand-gradient px-8 py-12 text-white sm:px-12 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="grid gap-2">
          <h2 className="text-3xl font-bold tracking-tight text-balance">{site.waitlistMode ? t("waitlistTitle") : t("closingTitle")}</h2>
          <p className="text-white/85">{site.waitlistMode ? t("waitlistIntro") : t("closingIntro")}</p>
        </div>
        {site.waitlistMode ? (
          <WaitlistForm turnstileKey={turnstileSiteKey()} inverted />
        ) : (
          <Button asChild size="lg" variant="secondary" className="w-fit">
            <Link href={cta.href}>
              {cta.label}
              <ArrowRightIcon />
            </Link>
          </Button>
        )}
      </div>
    </section>
  );
}

/** Three product areas, each next to an illustration, alternating sides. */
async function Showcase() {
  const t = await getTranslations("landing");
  const rows = [
    { key: "showQuotes", href: "/features/quotes-invoices", Mock: MockQuote },
    { key: "showArtists", href: "/features/artist-management", Mock: MockArtistRequest },
    { key: "showPayouts", href: "/features/payments-payouts", Mock: MockPayout },
  ] as const;
  return (
    <section className="mx-auto grid w-full max-w-[88rem] gap-20 px-5 py-20 sm:px-8 lg:px-12">
      {rows.map(({ key, href, Mock }, i) => (
        <div key={key} className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div className={i % 2 ? "lg:order-2" : undefined}>
            <div className="grid max-w-lg gap-4">
              <p className="text-sm font-medium text-magenta">{t(`${key}Eyebrow`)}</p>
              <h2 className="text-3xl font-bold tracking-tight text-balance">{t(`${key}Title`)}</h2>
              <p className="text-lg text-muted-foreground">{t(`${key}Body`)}</p>
              <ul className="grid gap-2">
                {(["1", "2", "3"] as const).map((p) => (
                  <li key={p} className="flex gap-2">
                    <CheckIcon className="mt-1 size-4 shrink-0 text-success" aria-hidden />
                    {t(`${key}Point${p}`)}
                  </li>
                ))}
              </ul>
              <Link href={href} className="flex w-fit items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
                {t("learnMore")}
                <ArrowRightIcon className="size-4" aria-hidden />
              </Link>
            </div>
          </div>
          <div className={i % 2 ? "lg:order-1" : undefined}>
            <Mock />
          </div>
        </div>
      ))}
    </section>
  );
}

/** Real screens of the app with demo data, and the way into the full tour. */
async function LookInside() {
  const t = await getTranslations("tour");
  const gallery = ["bookings", "booking", "payments"] as const;
  return (
    <section className="mx-auto grid w-full max-w-[88rem] gap-10 px-5 py-20 sm:px-8 lg:px-12">
      <div className="mx-auto grid max-w-2xl gap-3 text-center">
        <p className="text-sm font-medium text-magenta">{t("lookEyebrow")}</p>
        <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{t("lookTitle")}</h2>
        <p className="text-lg text-muted-foreground">{t("lookIntro")}</p>
      </div>
      <Screenshot name="hero-collage" className="rounded-3xl shadow-2xl shadow-primary/20" />
      <div className="grid gap-6 md:grid-cols-3">
        {gallery.map((key) => (
          <Link key={key} href={`/tour#${key}`} className="group grid content-start gap-3">
            <Screenshot name={key} className="transition-transform group-hover:-translate-y-1" />
            <span className="font-semibold">{t(`${key}_eyebrow`)}</span>
          </Link>
        ))}
      </div>
      <div className="flex flex-col items-center gap-2">
        <Button asChild size="lg" variant="outline">
          <Link href="/tour">
            {t("takeTour")}
            <ArrowRightIcon />
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground">{t("demoData")}</p>
      </div>
    </section>
  );
}
