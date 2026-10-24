import Image from "next/image";
import { getFormatter, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { ArticleView } from "@/lib/content";
import { cn } from "@/lib/utils";

/**
 * The building blocks of the blog: cover images, the lead story, cards and
 * the compact list. Headlines use the editorial serif from the blog layout.
 */

export function Cover({ article, sizes, priority = false, className }: { article: ArticleView; sizes: string; priority?: boolean; className?: string }) {
  if (!article.cover) {
    // No image yet: a quiet coloured field with the category, so the grid stays even.
    return (
      <div aria-hidden className={cn("grid aspect-[16/9] place-items-center bg-gradient-to-br from-primary/80 to-[oklch(0.62_0.2_352)] text-white", className)}>
        <span className="font-editorial text-2xl opacity-80">{article.category?.name ?? "StageDesk"}</span>
      </div>
    );
  }
  return (
    <Image
      src={article.cover}
      alt=""
      width={1600}
      height={900}
      sizes={sizes}
      priority={priority}
      unoptimized={!article.cover.startsWith("/")}
      className={cn("aspect-[16/9] h-auto w-full object-cover", className)}
    />
  );
}

export async function Meta({ article, className, withCategory = true }: { article: ArticleView; className?: string; withCategory?: boolean }) {
  const [t, format] = await Promise.all([getTranslations("blog"), getFormatter()]);
  return (
    <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground", className)}>
      {withCategory && article.category && (
        <>
          <span className="font-medium text-primary">{article.category.name}</span>
          <span aria-hidden>·</span>
        </>
      )}
      {article.publishedAt && <time dateTime={article.publishedAt.toISOString()}>{format.dateTime(article.publishedAt, { day: "numeric", month: "long", year: "numeric" })}</time>}
      <span aria-hidden>·</span>
      <span>{t("minutes", { count: article.minutes })}</span>
    </p>
  );
}

/** The opening story: big image, big headline. */
export async function LeadStory({ article }: { article: ArticleView }) {
  const t = await getTranslations("blog");
  return (
    <article className="group grid gap-5">
      <Link href={`/blog/${article.slug}`} className="block overflow-hidden rounded-2xl" tabIndex={-1} aria-hidden>
        <Cover article={article} sizes="(min-width: 1024px) 760px, 100vw" priority className="transition-transform duration-500 group-hover:scale-[1.02]" />
      </Link>
      <div className="grid gap-3">
        {article.featured && <p className="w-fit rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">{t("featured")}</p>}
        <h2 className="font-editorial text-3xl leading-[1.15] font-semibold tracking-tight text-balance sm:text-4xl lg:text-[2.75rem]">
          <Link href={`/blog/${article.slug}`} className="decoration-primary/40 decoration-2 underline-offset-[6px] hover:underline">
            {article.title}
          </Link>
        </h2>
        {article.excerpt && <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">{article.excerpt}</p>}
        <Meta article={article} />
      </div>
    </article>
  );
}

/** A card with image and short description, for grids. */
export async function ArticleCard({ article, headingLevel = "h3" }: { article: ArticleView; headingLevel?: "h2" | "h3" }) {
  const Heading = headingLevel;
  return (
    <article className="group grid content-start gap-4">
      <Link href={`/blog/${article.slug}`} className="block overflow-hidden rounded-xl border" tabIndex={-1} aria-hidden>
        <Cover article={article} sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw" className="transition-transform duration-500 group-hover:scale-[1.03]" />
      </Link>
      <div className="grid gap-2">
        {article.category && <p className="text-xs font-semibold tracking-wide text-primary uppercase">{article.category.name}</p>}
        <Heading className="font-editorial text-xl leading-snug font-semibold text-balance">
          <Link href={`/blog/${article.slug}`} className="decoration-primary/40 underline-offset-4 hover:underline">
            {article.title}
          </Link>
        </Heading>
        {article.excerpt && <p className="line-clamp-3 text-muted-foreground">{article.excerpt}</p>}
        <Meta article={article} withCategory={false} className="text-xs" />
      </div>
    </article>
  );
}

/** Headline-only items with a small image, like the side column of a front page. */
export async function CompactItem({ article }: { article: ArticleView }) {
  return (
    <article className="group grid grid-cols-[minmax(0,1fr)_6.5rem] gap-4">
      <div className="grid content-start gap-1.5">
        {article.category && <p className="text-xs font-semibold tracking-wide text-primary uppercase">{article.category.name}</p>}
        <h3 className="font-editorial text-lg leading-snug font-semibold text-balance">
          <Link href={`/blog/${article.slug}`} className="decoration-primary/40 underline-offset-4 hover:underline">
            {article.title}
          </Link>
        </h3>
        <Meta article={article} withCategory={false} className="text-xs" />
      </div>
      <Link href={`/blog/${article.slug}`} className="block overflow-hidden rounded-lg border" tabIndex={-1} aria-hidden>
        <Cover article={article} sizes="120px" className="aspect-square" />
      </Link>
    </article>
  );
}
