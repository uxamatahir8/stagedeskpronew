import { ArrowRightIcon, BookOpenIcon, SearchIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ContactBand, helpIcons } from "@/components/content/help-parts";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { type ArticleView, contentCategories, contentList } from "@/lib/content";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: PageProps<"/[locale]/help">): Promise<Metadata> {
  const locale = (await params).locale as Locale;
  const t = await getTranslations({ locale, namespace: "help" });
  return pageMetadata({ locale, title: t("title"), description: t("intro"), paths: { nl: "/help", en: "/help" } });
}


export default function HelpPage({ params, searchParams }: PageProps<"/[locale]/help">) {
  return (
    <main className="grid gap-16 pb-20">
      <Suspense fallback={<Skeleton className="mx-auto my-16 h-[32rem] w-full max-w-6xl" />}>
        <Help params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

/** Matches in the title count more than matches in the text; every word must match. */
function search(articles: ArticleView[], q: string) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return articles
    .map((a) => {
      const title = a.title.toLowerCase();
      const rest = `${a.excerpt} ${a.body}`.toLowerCase();
      let score = 0;
      for (const w of words) {
        if (title.includes(w)) score += 3;
        else if (rest.includes(w)) score += 1;
        else return null;
      }
      return { a, score };
    })
    .filter((x): x is { a: ArticleView; score: number } => x !== null)
    .sort((x, y) => y.score - x.score)
    .map((x) => x.a);
}

async function Help({ params, searchParams }: Pick<PageProps<"/[locale]/help">, "params" | "searchParams">) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 100) ?? "";
  const [t, categories, { articles }] = await Promise.all([getTranslations("help"), contentCategories("help"), contentList("help", locale, { pageSize: 500 })]);
  const en = locale === "en";
  const results = q ? search(articles, q) : [];
  const popular = articles.slice(0, 4);

  return (
    <>
      <section className="border-b bg-muted/40">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-14 sm:px-6 sm:py-20">
          <p className="text-sm font-medium text-primary">{t("title")}</p>
          <h1 className="max-w-2xl font-editorial text-4xl leading-tight font-bold tracking-tight text-balance sm:text-5xl">{t("heading")}</h1>
          <form role="search" className="flex max-w-2xl gap-2">
            <label htmlFor="help-q" className="sr-only">
              {t("searchLabel")}
            </label>
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input id="help-q" name="q" type="search" defaultValue={q} placeholder={t("searchPlaceholder")} className="h-12 bg-background pl-11 text-base" />
            </div>
            <Button type="submit" size="lg" className="h-12">
              {t("search")}
            </Button>
          </form>
          {!q && popular.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {t("popular")}
              {popular.map((a) => (
                <Link key={a.id} href={`/help/${a.slug}`} className="rounded-full border bg-background px-3 py-1 text-foreground hover:border-primary/50 hover:text-primary">
                  {a.title}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto grid w-full max-w-6xl gap-16 px-4 sm:px-6">
        {q ? (
          <section className="grid gap-6" aria-labelledby="results">
            <h2 id="results" className="text-xl font-semibold">
              {t("results", { count: results.length, q })}
            </h2>
            {results.length === 0 ? (
              <p className="text-muted-foreground">{t("noResults")}</p>
            ) : (
              <ul className="grid gap-3">
                {results.map((a) => (
                  <li key={a.id}>
                    <Link href={`/help/${a.slug}`} className="grid gap-1 rounded-xl border bg-card p-5 transition-colors hover:border-primary/50">
                      {a.category && <span className="text-xs font-medium text-primary">{a.category.name}</span>}
                      <span className="font-semibold">{a.title}</span>
                      {a.excerpt && <span className="text-sm text-muted-foreground">{a.excerpt}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/help" className="w-fit text-sm font-medium text-primary hover:underline">
              {t("allTopics")}
            </Link>
          </section>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {categories
              .filter((c) => c.count > 0)
              .map((c) => {
                const Icon = helpIcons[c.slug] ?? BookOpenIcon;
                const list = articles.filter((a) => a.categoryId === c.id);
                return (
                  <section key={c.id} id={c.slug} className="grid content-start gap-4 rounded-2xl border bg-card p-6" aria-labelledby={`cat-${c.slug}`}>
                    <div className="flex items-start gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <div className="grid gap-0.5">
                        <h2 id={`cat-${c.slug}`} className="font-semibold">
                          {en ? c.nameEn : c.nameNl}
                        </h2>
                        <p className="text-sm text-muted-foreground">{(en ? c.descriptionEn : c.descriptionNl) ?? t("articleCount", { count: list.length })}</p>
                      </div>
                    </div>
                    <ul className="grid gap-1 border-t pt-3">
                      {list.map((a) => (
                        <li key={a.id}>
                          <Link href={`/help/${a.slug}`} className="group flex items-start justify-between gap-2 rounded-md py-1.5 text-sm hover:text-primary">
                            {a.title}
                            <ArrowRightIcon className="mt-0.5 size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
          </div>
        )}

        <ContactBand />
      </div>
    </>
  );
}
