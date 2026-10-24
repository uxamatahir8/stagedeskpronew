import { BarChart3Icon, CheckIcon, FolderOpenIcon, LinkIcon, type LucideIcon, TicketPercentIcon, XIcon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { getSetting } from "@stagedesk/db";
import { SectionHeading, Steps } from "@/components/site/marketing-blocks";
import { PartnersNav } from "@/components/site/partners-nav";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { euro, percent } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/partners/how-it-works">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "partnerPages" });
  return pageMetadata({ locale, title: t("howMeta"), description: t("howMetaDescription"), paths: { nl: "/partners/how-it-works", en: "/partners/how-it-works" }, kicker: t("howEyebrow") });
}

const tools: { key: "tool1" | "tool2" | "tool3" | "tool4"; icon: LucideIcon }[] = [
  { key: "tool1", icon: LinkIcon },
  { key: "tool2", icon: TicketPercentIcon },
  { key: "tool3", icon: FolderOpenIcon },
  { key: "tool4", icon: BarChart3Icon },
];

export default async function HowItWorksPage({ params }: PageProps<"/[locale]/partners/how-it-works">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-16 px-4 py-12 sm:px-6 sm:py-16">
      <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
        <HowItWorks />
      </Suspense>
    </main>
  );
}

/** The whole route from applying to being paid, with the program's real numbers. */
async function HowItWorks() {
  await connection();
  const [t, tp, format, program] = await Promise.all([getTranslations("partnerPages"), getTranslations("partners"), getFormatter(), getSetting("affiliates.program")]);
  const months = program.commissionMonths === null ? tp("lifetime") : tp("months", { count: program.commissionMonths });
  const values = {
    rate: percent(format, program.commissionBps),
    discount: percent(format, program.promoDiscountBps),
    months: program.promoDiscountMonths,
    days: program.approvalDays,
    amount: euro(format, program.minPayoutCents),
  };
  return (
    <>
      <PartnersNav current="how" />
      <header className="grid max-w-3xl gap-4">
        <p className="text-sm font-medium text-primary">{t("howEyebrow")}</p>
        <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">{t("howTitle")}</h1>
        <p className="text-lg text-muted-foreground">{t("howIntro")}</p>
      </header>

      <Steps items={([1, 2, 3, 4, 5, 6] as const).map((i) => ({ title: t(`how${i}Title`, values), body: t(`how${i}Body`, values) }))} />

      <section className="grid gap-6 rounded-3xl border bg-card p-6 sm:p-10">
        <SectionHeading title={t("countsTitle")} />
        <div className="grid gap-8 md:grid-cols-2">
          <ul className="grid content-start gap-3">
            {(["counts1", "counts2", "counts3"] as const).map((k) => (
              <li key={k} className="flex gap-2.5">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success/15 text-success">
                  <CheckIcon className="size-3.5" aria-hidden />
                </span>
                {t(k, { months })}
              </li>
            ))}
          </ul>
          <ul className="grid content-start gap-3">
            {(["notCounts1", "notCounts2", "notCounts3"] as const).map((k) => (
              <li key={k} className="flex gap-2.5 text-muted-foreground">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-destructive/12 text-destructive">
                  <XIcon className="size-3.5" aria-hidden />
                </span>
                {t(k)}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="grid gap-8">
        <SectionHeading title={t("toolsTitle")} />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {tools.map(({ key, icon: Icon }) => (
            <article key={key} className="grid content-start gap-2">
              <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-1 font-semibold">{t(`${key}Title`)}</h3>
              <p className="text-sm text-muted-foreground">{t(`${key}Body`)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 rounded-3xl bg-[oklch(0.24_0.08_322)] p-8 text-white sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-12">
        <div className="grid gap-1">
          <h2 className="text-2xl font-bold tracking-tight">{t("apply")}</h2>
          <p className="text-white/75">{t("applyHint")}</p>
        </div>
        <Button asChild size="lg" className="bg-[oklch(0.66_0.2_352)] text-white hover:bg-[oklch(0.6_0.2_352)]">
          <Link href="/partners#apply">{t("apply")}</Link>
        </Button>
      </section>
    </>
  );
}
