import { ArrowRightIcon, Building2Icon, GuitarIcon, type LucideIcon, Music2Icon, XIcon } from "lucide-react";
import { connection } from "next/server";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { container, CtaBand, FaqList, FeatureRow, Proofs, SectionHeading, Steps } from "./marketing-blocks";
import { MockArtistRequest, MockPayout } from "./mockups";
import { Screenshot } from "./screenshot";
import { primaryCta } from "./site-chrome";

type Namespace = "forAgencies" | "forArtists";

async function HeroActions({ namespace }: { namespace: Namespace }) {
  await connection();
  const [ta, tr, cta] = await Promise.all([getTranslations("forAgencies"), getTranslations("forArtists"), primaryCta()]);
  // Artists join through their agency, so their page leads to signing in.
  const main = namespace === "forArtists" ? { href: "/sign-in", label: tr("cta") } : cta;
  return (
    <div className="flex flex-wrap gap-3">
      <Button asChild size="lg">
        <Link href={main.href}>
          {main.label}
          <ArrowRightIcon />
        </Link>
      </Button>
      <Button asChild size="lg" variant="outline">
        <Link href="/tour">{namespace === "forArtists" ? tr("tourLink") : ta("tourLink")}</Link>
      </Button>
    </div>
  );
}

function Hero({ namespace, eyebrow, title, intro, proofs, visual }: { namespace: Namespace; eyebrow: string; title: string; intro: string; proofs: string[]; visual: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden border-b">
      <div className={`${container} grid gap-12 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:py-24`}>
        <div className="grid content-start gap-6">
          <p className="text-sm font-medium text-primary">{eyebrow}</p>
          <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-[3.3rem] lg:leading-[1.05]">{title}</h1>
          <p className="max-w-xl text-lg text-muted-foreground">{intro}</p>
          <Suspense fallback={<Skeleton className="h-11 w-72" />}>
            <HeroActions namespace={namespace} />
          </Suspense>
          <Proofs items={proofs} />
        </div>
        <div className="min-w-0">{visual}</div>
      </div>
    </section>
  );
}

/** The problems on top, what changes underneath. */
async function PainGrid({ namespace }: { namespace: Namespace }) {
  const t = await getTranslations(namespace);
  return (
    <section className="border-b bg-muted/30">
      <div className={`${container} grid gap-10 py-20`}>
        <SectionHeading title={t("painTitle")} intro={t("painIntro")} />
        <div className="grid gap-5 md:grid-cols-2">
          {(["1", "2", "3", "4"] as const).map((i) => (
            <article key={i} className="grid content-start overflow-hidden rounded-2xl border bg-card">
              <p className="flex items-start gap-2.5 border-b bg-muted/40 px-6 py-3.5 text-sm text-muted-foreground">
                <XIcon className="mt-0.5 size-4 shrink-0 text-destructive/70" aria-hidden />
                <span className="line-through decoration-muted-foreground/40">{t(`pain${i}`)}</span>
              </p>
              <div className="grid gap-2 px-6 py-5">
                <h3 className="text-lg font-semibold">{t(`fix${i}`)}</h3>
                <p className="text-muted-foreground">{t(`fix${i}Body`)}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

async function Faq({ namespace, count }: { namespace: Namespace; count: number }) {
  const t = await getTranslations(namespace);
  const items = Array.from({ length: count }, (_, i) => ({ q: t(`faq${i + 1}Q` as "faq1Q"), a: t(`faq${i + 1}A` as "faq1A") }));
  return (
    <section className="border-t bg-muted/30">
      <div className="mx-auto grid w-full max-w-3xl gap-8 px-4 py-20 sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight">{t("faqTitle")}</h2>
        <FaqList items={items} />
      </div>
    </section>
  );
}

const sizes: { key: "size1" | "size2" | "size3"; icon: LucideIcon }[] = [
  { key: "size1", icon: Music2Icon },
  { key: "size2", icon: GuitarIcon },
  { key: "size3", icon: Building2Icon },
];

/** For agencies: a week with StageDesk, the main areas with screenshots, sizes, FAQ. */
export async function AgenciesPage() {
  const t = await getTranslations("forAgencies");
  const rows = [
    { key: "row1", screen: "booking" },
    { key: "row2", screen: "payments" },
    { key: "row3", screen: "calendar" },
    { key: "row4", screen: "booking-page" },
  ] as const;
  return (
    <main>
      <Hero
        namespace="forAgencies"
        eyebrow={t("eyebrow")}
        title={t("title")}
        intro={t("intro")}
        proofs={[t("proof1"), t("proof2"), t("proof3")]}
        visual={<Screenshot name="bookings" priority />}
      />
      <PainGrid namespace="forAgencies" />
      <section className={`${container} grid gap-12 py-20`}>
        <SectionHeading title={t("weekTitle")} intro={t("weekIntro")} />
        <Steps items={([1, 2, 3, 4, 5, 6] as const).map((i) => ({ label: t(`week${i}Day`), title: t(`week${i}Title`), body: t(`week${i}Body`) }))} />
      </section>
      <section className="border-t">
        <div className={`${container} grid gap-20 py-20`}>
          <SectionHeading title={t("deepTitle")} intro={t("deepIntro")} />
          {rows.map(({ key, screen }, i) => (
            <FeatureRow
              key={key}
              title={t(`${key}Title`)}
              body={t(`${key}Body`)}
              points={[t(`${key}P1`), t(`${key}P2`), t(`${key}P3`)]}
              visual={<Screenshot name={screen} />}
              reverse={i % 2 === 1}
            />
          ))}
        </div>
      </section>
      <section className="border-t bg-muted/30">
        <div className={`${container} grid gap-10 py-20`}>
          <SectionHeading title={t("sizesTitle")} />
          <div className="grid gap-5 md:grid-cols-3">
            {sizes.map(({ key, icon: Icon }) => (
              <article key={key} className="grid content-start gap-3 rounded-2xl border bg-card p-6">
                <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-5" aria-hidden />
                </span>
                <h3 className="text-lg font-semibold">{t(`${key}Title`)}</h3>
                <p className="text-muted-foreground">{t(`${key}Body`)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <Faq namespace="forAgencies" count={6} />
      <Suspense fallback={null}>
        <CtaBand title={t("closingTitle")} body={t("closingBody")} secondary={{ href: t("closingHref"), label: t("closingLink") }} />
      </Suspense>
    </main>
  );
}

/** For artists: what changes, the flow from request to payout, the app, FAQ. */
export async function ArtistsPage() {
  const t = await getTranslations("forArtists");
  return (
    <main>
      <Hero
        namespace="forArtists"
        eyebrow={t("eyebrow")}
        title={t("title")}
        intro={t("intro")}
        proofs={[t("proof1"), t("proof2"), t("proof3")]}
        visual={
          // The artist app on a phone, with a request card next to it.
          <div className="relative mx-auto grid max-w-xl grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] items-center gap-6">
            <Screenshot name="artist" priority className="max-w-[17rem] justify-self-end" />
            <div className="-ml-10 hidden sm:block">
              <MockArtistRequest />
            </div>
          </div>
        }
      />
      <PainGrid namespace="forArtists" />
      <section className={`${container} grid gap-12 py-20`}>
        <SectionHeading title={t("flowTitle")} intro={t("flowIntro")} />
        <Steps items={([1, 2, 3, 4] as const).map((i) => ({ title: t(`flow${i}Title`), body: t(`flow${i}Body`) }))} />
      </section>
      <section className="border-t">
        <div className={`${container} grid gap-20 py-20`}>
          <FeatureRow title={t("row1Title")} body={t("row1Body")} points={[t("row1P1"), t("row1P2"), t("row1P3")]} visual={<Screenshot name="artist" className="mx-auto max-w-[17rem]" />} />
          <FeatureRow
            title={t("row2Title")}
            body={t("row2Body")}
            points={[t("row2P1"), t("row2P2"), t("row2P3")]}
            visual={
              <div className="mx-auto max-w-md">
                <MockArtistRequest />
              </div>
            }
            reverse
          />
          <FeatureRow
            title={t("row3Title")}
            body={t("row3Body")}
            points={[t("row3P1"), t("row3P2"), t("row3P3")]}
            visual={
              <div className="mx-auto max-w-md">
                <MockPayout />
              </div>
            }
          />
        </div>
      </section>
      <section className="border-t bg-muted/30">
        <div className={`${container} grid gap-4 py-16 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center`}>
          <div className="grid gap-1">
            <h2 className="text-2xl font-bold tracking-tight">{t("agencyTitle")}</h2>
            <p className="text-muted-foreground">{t("agencyBody")}</p>
          </div>
          <Button asChild variant="outline" size="lg">
            <Link href="/for-agencies">
              {t("agencyLink")}
              <ArrowRightIcon />
            </Link>
          </Button>
        </div>
      </section>
      <Faq namespace="forArtists" count={5} />
    </main>
  );
}
