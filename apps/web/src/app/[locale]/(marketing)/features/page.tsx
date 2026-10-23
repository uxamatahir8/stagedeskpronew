import {
  ArrowRightIcon,
  BellRingIcon,
  CalendarCheckIcon,
  FileTextIcon,
  GlobeIcon,
  HandCoinsIcon,
  LineChartIcon,
  type LucideIcon,
  Music2Icon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageIntro } from "@/components/site/page-intro";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/features">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "featuresPage" });
  return pageMetadata({ locale, title: t("title"), description: t("intro"), paths: { nl: "/features", en: "/features" }, kicker: t("eyebrow") });
}

/** Sections with a page of their own link to it. */
const detail: Record<string, string> = { bookingPage: "booking-page", quotes: "quotes-invoices", payments: "payments-payouts", artists: "artist-management" };

const sections: { key: string; icon: LucideIcon; points: number }[] = [
  { key: "bookingPage", icon: GlobeIcon, points: 4 },
  { key: "quotes", icon: FileTextIcon, points: 4 },
  { key: "planning", icon: CalendarCheckIcon, points: 3 },
  { key: "artists", icon: Music2Icon, points: 4 },
  { key: "payments", icon: HandCoinsIcon, points: 4 },
  { key: "communication", icon: BellRingIcon, points: 3 },
  { key: "team", icon: UsersIcon, points: 3 },
  { key: "insights", icon: LineChartIcon, points: 3 },
  { key: "security", icon: ShieldCheckIcon, points: 3 },
];

export default async function FeaturesPage({ params }: PageProps<"/[locale]/features">) {
  setRequestLocale((await params).locale as Locale);
  const t = await getTranslations("featuresPage");
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-16 px-4 py-16 sm:px-6 sm:py-20">
      <PageIntro eyebrow={t("eyebrow")} title={t("title")} intro={t("intro")} />
      <div className="grid gap-x-12 gap-y-14 md:grid-cols-2">
        {sections.map(({ key, icon: Icon, points }) => (
          <section key={key} id={key} className="grid content-start gap-3 scroll-mt-24">
            <span className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary/15 to-magenta/15 text-primary">
              <Icon className="size-5" aria-hidden />
            </span>
            <h2 className="text-xl font-semibold">{t(`${key}.title` as "quotes.title")}</h2>
            <p className="text-muted-foreground">{t(`${key}.body` as "quotes.body")}</p>
            <ul className="grid gap-1.5 text-sm">
              {Array.from({ length: points }, (_, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  {t(`${key}.p${i + 1}` as "quotes.p1")}
                </li>
              ))}
            </ul>
            {detail[key] && (
              <Link href={`/features/${detail[key]}`} className="flex w-fit items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
                {t("learnMore")}
                <ArrowRightIcon className="size-4" aria-hidden />
              </Link>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}
