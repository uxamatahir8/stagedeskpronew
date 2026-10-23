import { ArrowRightIcon, CheckIcon } from "lucide-react";
import { connection } from "next/server";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { jsonLd } from "@/lib/seo";
import { type MockupKey, mockups } from "./mockups";
import { primaryCta } from "./site-chrome";

/** The message shape every feature and solution page shares (see featureDetail.* in the message files). */
type DetailNamespace = `featureDetail.${string}`;

/**
 * A long-form page about one feature or one audience: what it is, why it
 * helps, how it works step by step, the details, and the questions people
 * ask, with FAQ structured data for search engines.
 */
export async function DetailPage({ namespace, mockup, related }: { namespace: DetailNamespace; mockup: MockupKey; related: { href: string; label: string }[] }) {
  const t = await getTranslations(namespace as "featureDetail.booking-page");
  const tc = await getTranslations("detailPage");
  const Mock = mockups[mockup];
  const benefits = ["b1", "b2", "b3"] as const;
  const steps = ["s1", "s2", "s3", "s4"] as const;
  const points = ["p1", "p2", "p3", "p4", "p5", "p6"] as const;
  const faq = (["1", "2", "3", "4"] as const).map((i) => ({ q: t(`q${i}`), a: t(`a${i}`) }));

  return (
    <main>
      <section className="relative overflow-hidden border-b">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(50rem_26rem_at_80%_-10%,color-mix(in_oklch,var(--magenta)_14%,transparent),transparent),radial-gradient(40rem_24rem_at_0%_110%,color-mix(in_oklch,var(--primary)_12%,transparent),transparent)]" />
        <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:py-20">
          <div className="grid gap-5">
            <p className="text-sm font-semibold tracking-wider text-magenta uppercase">{t("eyebrow")}</p>
            <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">{t("title")}</h1>
            <p className="max-w-xl text-lg text-muted-foreground">{t("intro")}</p>
            <Suspense fallback={<Skeleton className="h-10 w-56" />}>
              <Cta />
            </Suspense>
          </div>
          <Mock />
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-20 sm:px-6 md:grid-cols-3">
        {benefits.map((b, i) => (
          <article key={b} className="grid content-start gap-3 rounded-2xl border bg-card p-6">
            <span className="flex size-10 items-center justify-center rounded-xl bg-brand-gradient text-sm font-bold text-white tabular-nums">{i + 1}</span>
            <h2 className="text-lg font-semibold">{t(`${b}Title`)}</h2>
            <p className="text-muted-foreground">{t(`${b}Body`)}</p>
          </article>
        ))}
      </section>

      <section className="border-y bg-muted/30">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 sm:px-6">
          <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-balance">{t("stepsTitle")}</h2>
          <ol className="relative grid gap-8 md:grid-cols-4">
            <div aria-hidden className="absolute top-5 right-[12.5%] left-[12.5%] hidden h-0.5 bg-brand-gradient opacity-40 md:block" />
            {steps.map((s, i) => (
              <li key={s} className="relative grid content-start justify-items-start gap-3 md:justify-items-center md:text-center">
                <span className="relative flex size-10 items-center justify-center rounded-full border-2 border-primary bg-background text-sm font-bold text-primary tabular-nums">{i + 1}</span>
                <h3 className="font-semibold">{t(`${s}Title`)}</h3>
                <p className="text-sm text-muted-foreground">{t(`${s}Body`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="grid content-start gap-3">
          <h2 className="text-3xl font-bold tracking-tight text-balance">{t("pointsTitle")}</h2>
          <p className="text-muted-foreground">{t("pointsIntro")}</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {points.map((p) => (
            <li key={p} className="flex gap-3 rounded-xl border bg-card p-4 text-sm">
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              {t(p)}
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t bg-muted/30">
        <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-20 sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight">{tc("faqTitle")}</h2>
          <div className="divide-y rounded-xl border bg-card">
            {faq.map((item) => (
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
            dangerouslySetInnerHTML={jsonLd({ "@type": "FAQPage", mainEntity: faq.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })) })}
          />
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-20 sm:px-6">
        <div className="grid gap-3">
          <h2 className="text-xl font-semibold">{tc("related")}</h2>
          <div className="flex flex-wrap gap-2">
            {related.map((r) => (
              <Button key={r.href} asChild variant="outline">
                <Link href={r.href}>
                  {r.label}
                  <ArrowRightIcon />
                </Link>
              </Button>
            ))}
          </div>
        </div>
        <div className="grid gap-6 rounded-3xl bg-brand-gradient px-8 py-12 text-white sm:px-12 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="grid gap-2">
            <h2 className="text-3xl font-bold tracking-tight text-balance">{t("ctaTitle")}</h2>
            <p className="text-white/85">{t("ctaBody")}</p>
          </div>
          <Suspense fallback={null}>
            <Cta inverted />
          </Suspense>
        </div>
      </section>
    </main>
  );
}

async function Cta({ inverted = false }: { inverted?: boolean }) {
  await connection();
  const [tc, cta] = await Promise.all([getTranslations("detailPage"), primaryCta()]);
  return (
    <div className="flex flex-wrap gap-3">
      <Button asChild size="lg" variant={inverted ? "secondary" : "default"}>
        <Link href={cta.href}>
          {cta.label}
          <ArrowRightIcon />
        </Link>
      </Button>
      {!inverted && (
        <Button asChild size="lg" variant="outline">
          <Link href="/pricing">{tc("seePricing")}</Link>
        </Button>
      )}
    </div>
  );
}
