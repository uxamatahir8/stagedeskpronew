import { CheckIcon } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { type ScreenKey, Screenshot, screens } from "@/components/site/screenshot";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/tour">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "tour" });
  return pageMetadata({ locale, title: t("metaTitle"), description: t("metaDescription"), paths: { nl: "/tour", en: "/tour" }, kicker: t("eyebrow") });
}

/** The tour, in the order an agency meets the app: its day, a booking, the money, then the people around it. */
const stops: ScreenKey[] = ["dashboard", "bookings", "booking", "calendar", "payments", "booking-page", "artist", "customer", "admin"];

export default async function TourPage({ params }: PageProps<"/[locale]/tour">) {
  setRequestLocale((await params).locale as Locale);
  const t = await getTranslations("tour");
  return (
    <main>
      <section className="relative overflow-hidden border-b">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(50rem_26rem_at_50%_-10%,color-mix(in_oklch,var(--magenta)_14%,transparent),transparent)]" />
        <div className="relative mx-auto grid w-full max-w-6xl justify-items-center gap-6 px-4 pt-16 pb-12 text-center sm:px-6 sm:pt-20">
          <p className="text-sm font-semibold tracking-wider text-magenta uppercase">{t("eyebrow")}</p>
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight text-balance sm:text-5xl">{t.rich("title", { hl: (c) => <span className="text-brand-gradient">{c}</span> })}</h1>
          <p className="max-w-2xl text-lg text-muted-foreground">{t("intro")}</p>
          <Screenshot name="hero-collage" priority className="mt-6 rounded-3xl shadow-2xl shadow-primary/20" />
          <p className="text-sm text-muted-foreground">{t("demoData")}</p>
        </div>
      </section>

      {stops.map((key, i) => {
        const phone = screens[key].kind === "phone";
        const id = key.replace("-", "_") as "dashboard";
        return (
          <section key={key} id={key} className={cn("scroll-mt-20", i % 2 === 1 && "border-y bg-muted/30")}>
            <div className={cn("mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-20 sm:px-6", phone ? "lg:grid-cols-[1.4fr_1fr]" : "lg:grid-cols-[1fr_1.6fr]")}>
              <div className={cn("grid content-start gap-4", i % 2 === 1 && "lg:order-2")}>
                <p className="text-sm font-semibold tracking-wider text-magenta uppercase">{t(`${id}_eyebrow`)}</p>
                <h2 className="text-3xl font-bold tracking-tight text-balance">{t(`${id}_title`)}</h2>
                <p className="text-lg text-muted-foreground">{t(`${id}_body`)}</p>
                <ul className="grid gap-2">
                  {(["1", "2", "3"] as const).map((n) => (
                    <li key={n} className="flex gap-2">
                      <CheckIcon className="mt-1 size-4 shrink-0 text-success" aria-hidden />
                      {t(`${id}_p${n}`)}
                    </li>
                  ))}
                </ul>
              </div>
              <div className={cn("flex justify-center", i % 2 === 1 && "lg:order-1")}>
                <Screenshot name={key} className={phone ? "max-w-[300px]" : undefined} />
              </div>
            </div>
          </section>
        );
      })}
    </main>
  );
}
