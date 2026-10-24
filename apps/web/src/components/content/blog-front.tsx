import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { connection } from "next/server";
import { getFormatter, getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { contentCategories, contentList } from "@/lib/content";
import { cn } from "@/lib/utils";
import { ArticleCard, CompactItem, LeadStory } from "./article-parts";

type Locale = "nl" | "en";
const PAGE_SIZE = 12;

/** The name of the blog across the top, with today's date like a paper. */
export async function Masthead({ locale, active }: { locale: Locale; active: string | null }) {
  // Today's date is per request.
  await connection();
  const [t, format, categories] = await Promise.all([getTranslations("blog"), getFormatter(), contentCategories("blog")]);
  const shown = categories.filter((c) => c.count > 0);
  const name = (c: (typeof categories)[number]) => (locale === "en" ? c.nameEn : c.nameNl);
  return (
    <header className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b-4 border-double border-foreground/80 pb-4">
        <div className="grid gap-1">
          <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">{format.dateTime(new Date(), { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          <h1 className="font-editorial text-5xl leading-none font-bold tracking-tight sm:text-6xl">{t("masthead")}</h1>
        </div>
        <p className="max-w-md text-muted-foreground sm:text-right">{t("intro")}</p>
      </div>
      <nav aria-label={t("categories")} className="-mx-4 overflow-x-auto px-4">
        <ul className="flex min-w-max items-center gap-1 border-b pb-3 text-sm">
          <li>
            <CategoryLink href="/blog" current={active === null}>
              {t("allCategories")}
            </CategoryLink>
          </li>
          {shown.map((c) => (
            <li key={c.id}>
              <CategoryLink href={`/blog/category/${c.slug}`} current={active === c.slug}>
                {name(c)} <span className="text-muted-foreground tabular-nums">{c.count}</span>
              </CategoryLink>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

function CategoryLink({ href, current, children }: { href: string; current: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn("inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-medium transition-colors", current ? "bg-foreground text-background" : "hover:bg-muted")}
    >
      {children}
    </Link>
  );
}

/** Front page: lead story with a column of the latest next to it, then the rest by category. */
export async function BlogFront({ locale, page }: { locale: Locale; page: number }) {
  const t = await getTranslations("blog");
  const { articles, pages } = await contentList("blog", locale, { page, pageSize: PAGE_SIZE + 1 });
  if (articles.length === 0) return <Empty />;
  if (page > 1) return <Grid articles={articles} page={page} pages={pages} base="/blog" />;

  const [lead, ...rest] = articles;
  const side = rest.slice(0, 4);
  const more = rest.slice(4);
  return (
    <div className="grid gap-16">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-8">{lead && <LeadStory article={lead} />}</div>
        {side.length > 0 && (
          <aside className="grid content-start gap-5 lg:col-span-4 lg:border-l lg:pl-10">
            <h2 className="border-b pb-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{t("latest")}</h2>
            <ol className="grid gap-5 divide-y [&>li:not(:first-child)]:pt-5">
              {side.map((a) => (
                <li key={a.id}>
                  <CompactItem article={a} />
                </li>
              ))}
            </ol>
          </aside>
        )}
      </div>
      {more.length > 0 && (
        <section className="grid gap-6" aria-labelledby="more-stories">
          <h2 id="more-stories" className="border-b-2 border-foreground/80 pb-2 font-editorial text-2xl font-semibold">
            {t("moreStories")}
          </h2>
          <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {more.map((a) => (
              <li key={a.id}>
                <ArticleCard article={a} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <CategorySections locale={locale} />
      <Pagination page={1} pages={pages} base="/blog" />
    </div>
  );
}

/** Each category with its three newest posts, like the sections of a paper. */
async function CategorySections({ locale }: { locale: Locale }) {
  const [t, categories] = await Promise.all([getTranslations("blog"), contentCategories("blog")]);
  const withPosts = categories.filter((c) => c.count >= 2);
  if (withPosts.length < 2) return null;
  const sections = await Promise.all(withPosts.map(async (c) => ({ c, list: (await contentList("blog", locale, { categorySlug: c.slug, pageSize: 3 })).articles })));
  return (
    <div className="grid gap-14">
      {sections.map(({ c, list }) => {
        const name = locale === "en" ? c.nameEn : c.nameNl;
        return (
          <section key={c.id} className="grid gap-6" aria-labelledby={`section-${c.slug}`}>
            <div className="flex items-end justify-between gap-4 border-b-2 border-foreground/80 pb-2">
              <h2 id={`section-${c.slug}`} className="font-editorial text-2xl font-semibold">
                {name}
              </h2>
              <Link href={`/blog/category/${c.slug}`} className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                {t("allIn", { category: name })}
                <ArrowRightIcon className="size-4" aria-hidden />
              </Link>
            </div>
            <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((a) => (
                <li key={a.id}>
                  <ArticleCard article={a} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** A category page: its newest post as lead, the rest as cards. */
export async function CategoryFront({ locale, slug, page }: { locale: Locale; slug: string; page: number }) {
  const { articles, pages } = await contentList("blog", locale, { categorySlug: slug, page, pageSize: PAGE_SIZE + 1 });
  if (articles.length === 0) return <Empty />;
  if (page > 1) return <Grid articles={articles} page={page} pages={pages} base={`/blog/category/${slug}`} />;
  const [lead, ...rest] = articles;
  return (
    <div className="grid gap-14">
      {lead && (
        <div className="max-w-4xl">
          <LeadStory article={lead} />
        </div>
      )}
      {rest.length > 0 && (
        <ul className="grid gap-x-8 gap-y-12 border-t pt-12 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((a) => (
            <li key={a.id}>
              <ArticleCard article={a} />
            </li>
          ))}
        </ul>
      )}
      <Pagination page={1} pages={pages} base={`/blog/category/${slug}`} />
    </div>
  );
}

async function Grid({ articles, page, pages, base }: { articles: Awaited<ReturnType<typeof contentList>>["articles"]; page: number; pages: number; base: string }) {
  return (
    <div className="grid gap-12">
      <ul className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {articles.map((a) => (
          <li key={a.id}>
            <ArticleCard article={a} />
          </li>
        ))}
      </ul>
      <Pagination page={page} pages={pages} base={base} />
    </div>
  );
}

async function Pagination({ page, pages, base }: { page: number; pages: number; base: string }) {
  if (pages <= 1) return null;
  const t = await getTranslations("blog");
  const href = (p: number) => (p === 1 ? base : `${base}?page=${p}`);
  return (
    <nav aria-label={t("pagination")} className="flex items-center justify-between gap-4 border-t pt-6 text-sm">
      {page > 1 ? (
        <Link href={href(page - 1)} rel="prev" className="flex items-center gap-1 font-medium hover:text-primary">
          <ArrowLeftIcon className="size-4" aria-hidden />
          {t("newer")}
        </Link>
      ) : (
        <span />
      )}
      <span className="text-muted-foreground tabular-nums">{t("pageOf", { page, pages })}</span>
      {page < pages ? (
        <Link href={href(page + 1)} rel="next" className="flex items-center gap-1 font-medium hover:text-primary">
          {t("older")}
          <ArrowRightIcon className="size-4" aria-hidden />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

async function Empty() {
  const t = await getTranslations("blog");
  return <p className="py-16 text-center text-muted-foreground">{t("empty")}</p>;
}

export function FrontSkeleton() {
  return (
    <div className="grid gap-10">
      <Skeleton className="h-28 w-full" />
      <div className="grid gap-10 lg:grid-cols-12">
        <Skeleton className="aspect-[16/9] w-full lg:col-span-8" />
        <Skeleton className="h-96 w-full lg:col-span-4" />
      </div>
    </div>
  );
}
