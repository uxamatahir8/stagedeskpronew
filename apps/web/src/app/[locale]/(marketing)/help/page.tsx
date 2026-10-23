import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageIntro } from "@/components/site/page-intro";
import { articles, helpCategories } from "@/content/help";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/help">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "help" });
  return pageMetadata({ locale, title: t("title"), description: t("intro"), paths: { nl: "/help", en: "/help" } });
}

export default async function HelpPage({ params }: PageProps<"/[locale]/help">) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations("help");
  return (
    <main className="mx-auto grid w-full max-w-5xl gap-12 px-4 py-16 sm:px-6 sm:py-20">
      <PageIntro title={t("title")} intro={t("intro")} />
      <div className="grid gap-10 md:grid-cols-2">
        {helpCategories.map((category) => {
          const list = articles.filter((a) => a.category === category);
          if (list.length === 0) return null;
          return (
            <section key={category} className="grid content-start gap-3">
              <h2 className="text-lg font-semibold">{t(`category_${category}`)}</h2>
              <ul className="grid gap-2">
                {list.map((a) => (
                  <li key={a.slug}>
                    <Link href={`/help/${a.slug}`} className="grid gap-0.5 rounded-lg border bg-card p-4 transition-colors hover:border-primary/50">
                      <span className="font-medium">{a[locale].title}</span>
                      <span className="text-sm text-muted-foreground">{a[locale].description}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <p className="text-muted-foreground">
        {t("notFound")}{" "}
        <Link href="/contact" className="font-medium text-primary underline-offset-4 hover:underline">
          {t("contactUs")}
        </Link>
      </p>
    </main>
  );
}
