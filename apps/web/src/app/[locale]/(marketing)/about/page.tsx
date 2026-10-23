import { ArrowRightIcon, HandshakeIcon, HeartIcon, type LucideIcon, ScaleIcon, ShieldCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { CapabilityFigures } from "@/components/site/infographics";
import { primaryCta } from "@/components/site/site-chrome";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { appUrl } from "@/lib/mail";
import { jsonLd, pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/about">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "about" });
  return pageMetadata({ locale, title: t("metaTitle"), description: t("metaDescription"), paths: { nl: "/about", en: "/about" }, kicker: t("eyebrow") });
}

const values: { key: "simple" | "fair" | "privacy" | "together"; icon: LucideIcon }[] = [
  { key: "simple", icon: HeartIcon },
  { key: "fair", icon: ScaleIcon },
  { key: "privacy", icon: ShieldCheckIcon },
  { key: "together", icon: HandshakeIcon },
];

export default async function AboutPage({ params }: PageProps<"/[locale]/about">) {
  setRequestLocale((await params).locale as Locale);
  const t = await getTranslations("about");
  return (
    <main>
      <section className="relative overflow-hidden border-b">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(50rem_28rem_at_15%_-10%,color-mix(in_oklch,var(--primary)_16%,transparent),transparent),radial-gradient(40rem_26rem_at_100%_100%,color-mix(in_oklch,var(--magenta)_14%,transparent),transparent)]" />
        <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.3fr_1fr] lg:items-center lg:py-24">
          <div className="grid gap-5">
            <p className="text-sm font-semibold tracking-wider text-magenta uppercase">{t("eyebrow")}</p>
            <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">{t.rich("title", { hl: (c) => <span className="text-brand-gradient">{c}</span> })}</h1>
            <p className="max-w-xl text-lg text-muted-foreground">{t("intro")}</p>
          </div>
          <div className="relative mx-auto grid aspect-square w-full max-w-xs place-items-center rounded-[2rem] bg-brand-gradient p-1.5 shadow-2xl shadow-magenta/20">
            <div className="grid size-full place-items-center rounded-[1.75rem] bg-card p-8">
              <Logo className="h-auto w-full" />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.3fr]">
        <h2 className="text-3xl font-bold tracking-tight text-balance">{t("storyTitle")}</h2>
        <div className="grid gap-4 text-lg text-muted-foreground">
          <p>{t("story1")}</p>
          <p>{t("story2")}</p>
          <p>{t("story3")}</p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <blockquote className="relative overflow-hidden rounded-3xl bg-brand-gradient px-8 py-12 text-white sm:px-14">
          <div aria-hidden className="absolute -top-20 -right-16 size-72 rounded-full bg-white/10 blur-2xl" />
          <p className="relative text-sm font-semibold tracking-wider text-white/80 uppercase">{t("missionLabel")}</p>
          <p className="relative mt-3 max-w-3xl text-2xl leading-snug font-semibold text-balance sm:text-3xl">{t("mission")}</p>
        </blockquote>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 sm:px-6">
        <div className="grid max-w-2xl gap-3">
          <h2 className="text-3xl font-bold tracking-tight">{t("valuesTitle")}</h2>
          <p className="text-lg text-muted-foreground">{t("valuesIntro")}</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {values.map(({ key, icon: Icon }) => (
            <article key={key} className="grid content-start gap-3 rounded-2xl border bg-card p-6">
              <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-magenta/15 text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="font-semibold">{t(`value_${key}`)}</h3>
              <p className="text-sm text-muted-foreground">{t(`value_${key}Body`)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y bg-muted/30">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 sm:px-6">
          <div className="grid max-w-2xl gap-3">
            <h2 className="text-3xl font-bold tracking-tight">{t("howTitle")}</h2>
            <p className="text-lg text-muted-foreground">{t("howIntro")}</p>
          </div>
          <CapabilityFigures />
          <div className="grid gap-6 md:grid-cols-3">
            {(["how1", "how2", "how3"] as const).map((k) => (
              <div key={k} className="grid content-start gap-2">
                <h3 className="font-semibold">{t(`${k}Title`)}</h3>
                <p className="text-muted-foreground">{t(`${k}Body`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="grid gap-2">
          <h2 className="text-3xl font-bold tracking-tight text-balance">{t("ctaTitle")}</h2>
          <p className="text-lg text-muted-foreground">{t("ctaBody")}</p>
        </div>
        <Suspense fallback={null}>
          <AboutCta />
        </Suspense>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd({
          "@type": "Organization",
          name: "StageDesk Pro",
          url: appUrl,
          logo: `${appUrl}/brand/logo.png`,
          areaServed: "NL",
          description: t("metaDescription"),
        })}
      />
    </main>
  );
}

async function AboutCta() {
  await connection();
  const [t, cta] = await Promise.all([getTranslations("about"), primaryCta()]);
  return (
    <div className="flex flex-wrap gap-3">
      <Button asChild size="lg">
        <Link href={cta.href}>
          {cta.label}
          <ArrowRightIcon />
        </Link>
      </Button>
      <Button asChild size="lg" variant="outline">
        <Link href="/contact">{t("contact")}</Link>
      </Button>
    </div>
  );
}
