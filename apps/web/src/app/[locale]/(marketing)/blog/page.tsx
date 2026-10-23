import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { PageIntro } from "@/components/site/page-intro";
import { posts } from "@/content/blog";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/blog">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "blog" });
  return pageMetadata({ locale, title: t("title"), description: t("intro"), paths: { nl: "/blog", en: "/blog" } });
}

export default async function BlogPage({ params }: PageProps<"/[locale]/blog">) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const [t, format] = await Promise.all([getTranslations("blog"), getFormatter()]);
  return (
    <main className="mx-auto grid w-full max-w-4xl gap-12 px-4 py-16 sm:px-6 sm:py-20">
      <PageIntro title={t("title")} intro={t("intro")} />
      <ol className="grid gap-4">
        {posts.map((p) => (
          <li key={p.slug}>
            <Link href={`/blog/${p.slug}`} className="grid gap-2 rounded-2xl border bg-card p-6 transition-colors hover:border-primary/50">
              <span className="text-xs text-muted-foreground">
                <time dateTime={p.date}>{format.dateTime(new Date(`${p.date}T12:00:00Z`), { day: "numeric", month: "long", year: "numeric" })}</time> ·{" "}
                {t(`category_${p.category}`)} · {t("minutes", { count: p.readingMinutes })}
              </span>
              <span className="text-xl font-semibold text-balance">{p[locale].title}</span>
              <span className="text-muted-foreground">{p[locale].description}</span>
            </Link>
          </li>
        ))}
      </ol>
    </main>
  );
}
