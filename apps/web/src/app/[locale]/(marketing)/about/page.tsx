import { ArrowRightIcon, BadgePercentIcon, Building2Icon, HandshakeIcon, HeartIcon, type LucideIcon, Music2Icon, PartyPopperIcon, ScaleIcon, ShieldCheckIcon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { ArticleCard } from "@/components/content/article-parts";
import { editorialFont } from "@/components/content/editorial-font";
import { Screenshot } from "@/components/site/screenshot";
import { CapabilityFigures } from "@/components/site/infographics";
import { primaryCta } from "@/components/site/site-chrome";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { appUrl } from "@/lib/mail";
import { contentList } from "@/lib/content";
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

const audiences: { key: "agencies" | "artists" | "customers" | "partners"; icon: LucideIcon; href: string }[] = [
  { key: "agencies", icon: Building2Icon, href: "/for-agencies" },
  { key: "artists", icon: Music2Icon, href: "/for-artists" },
  { key: "customers", icon: PartyPopperIcon, href: "/request" },
  { key: "partners", icon: BadgePercentIcon, href: "/partners" },
];

export default async function AboutPage({ params }: PageProps<"/[locale]/about">) {
  setRequestLocale((await params).locale as Locale);
  const t = await getTranslations("about");
  return (
    <main className={editorialFont.variable}>
      <section className="relative overflow-hidden border-b">
        <div className="relative mx-auto grid w-full max-w-[88rem] gap-10 px-5 py-16 sm:px-8 lg:px-12 lg:grid-cols-[1.3fr_1fr] lg:items-center lg:py-24">
          <div className="grid gap-5">
            <p className="text-sm font-medium text-magenta">{t("eyebrow")}</p>
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

      <section className="mx-auto grid w-full max-w-[88rem] gap-12 px-5 py-20 sm:px-8 lg:px-12 lg:grid-cols-[1fr_1.3fr]">
        <h2 className="text-3xl font-bold tracking-tight text-balance">{t("storyTitle")}</h2>
        <div className="grid gap-4 text-lg text-muted-foreground">
          <p>{t("story1")}</p>
          <p>{t("story2")}</p>
          <p>{t("story3")}</p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[88rem] px-5 sm:px-8 lg:px-12">
        <blockquote className="relative overflow-hidden rounded-3xl bg-brand-gradient px-8 py-12 text-white sm:px-14">
          <div aria-hidden className="absolute -top-20 -right-16 size-72 rounded-full bg-white/10 blur-2xl" />
          <p className="relative text-sm font-semibold tracking-wider text-white/80 uppercase">{t("missionLabel")}</p>
          <p className="relative mt-3 max-w-3xl text-2xl leading-snug font-semibold text-balance sm:text-3xl">{t("mission")}</p>
        </blockquote>
      </section>

      <section className="mx-auto grid w-full max-w-[88rem] gap-10 px-5 pt-20 sm:px-8 lg:px-12">
        <div className="grid max-w-2xl gap-3">
          <h2 className="text-3xl font-bold tracking-tight">{t("whoTitle")}</h2>
          <p className="text-lg text-muted-foreground">{t("whoIntro")}</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {audiences.map(({ key, icon: Icon, href }) => (
            <Link key={key} href={href} className="group grid content-start gap-3 rounded-2xl border bg-card p-6 transition-colors hover:border-primary/50">
              <Icon className="size-6 text-primary" aria-hidden />
              <h3 className="flex items-center gap-1 font-semibold">
                {t(`who_${key}`)}
                <ArrowRightIcon className="size-4 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
              </h3>
              <p className="text-sm text-muted-foreground">{t(`who_${key}Body`)}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-[88rem] items-center gap-10 px-5 pt-20 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:px-12">
        <div className="grid content-start gap-4">
          <h2 className="text-3xl font-bold tracking-tight">{t("productTitle")}</h2>
          <p className="text-lg text-muted-foreground">{t("productBody")}</p>
          <Link href="/tour" className="flex w-fit items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
            {t("productLink")}
            <ArrowRightIcon className="size-4" aria-hidden />
          </Link>
        </div>
        <Screenshot name="hero-collage" className="rounded-2xl" />
      </section>

      <section className="mx-auto grid w-full max-w-[88rem] gap-10 px-5 py-20 sm:px-8 lg:px-12">
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
        <div className="mx-auto grid w-full max-w-[88rem] gap-10 px-5 py-20 sm:px-8 lg:px-12">
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

      <Suspense fallback={<Skeleton className="mx-auto my-20 h-80 w-full max-w-[88rem]" />}>
        <LatestPosts />
      </Suspense>

      <section className="mx-auto grid w-full max-w-[88rem] gap-6 px-5 py-20 sm:px-8 lg:px-12 lg:grid-cols-[1fr_auto] lg:items-center">
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

/** The three newest blog posts, so the page stays fresh. */
async function LatestPosts() {
  const [t, locale] = await Promise.all([getTranslations("about"), getLocale()]);
  const { articles } = await contentList("blog", locale as Locale, { pageSize: 3 });
  if (articles.length === 0) return null;
  return (
    <section className="mx-auto grid w-full max-w-[88rem] gap-8 px-5 pt-20 sm:px-8 lg:px-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="text-3xl font-bold tracking-tight">{t("blogTitle")}</h2>
        <Link href="/blog" className="flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
          {t("blogLink")}
          <ArrowRightIcon className="size-4" aria-hidden />
        </Link>
      </div>
      <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {articles.map((a) => (
          <li key={a.id}>
            <ArticleCard article={a} />
          </li>
        ))}
      </ul>
    </section>
  );
}
