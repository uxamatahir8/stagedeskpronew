import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { prisma } from "@stagedesk/db";
import { Skeleton } from "@/components/ui/skeleton";
import { findPost, loadPost, posts } from "@/content/blog";
import { Link } from "@/i18n/navigation";
import { type Locale, routing } from "@/i18n/routing";
import { jsonLd, pageMetadata, siteUrl } from "@/lib/seo";
import { turnstileSiteKey } from "@/lib/turnstile";
import { CommentForm } from "./comment-form";

export function generateStaticParams() {
  return routing.locales.flatMap((locale) => posts.map((p) => ({ locale, slug: p.slug })));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/blog/[slug]">): Promise<Metadata> {
  const { locale, slug } = await params;
  const post = findPost(slug);
  if (!post) return {};
  const meta = post[locale as Locale];
  return pageMetadata({ locale: locale as Locale, title: meta.title, description: meta.description, paths: { nl: `/blog/${slug}`, en: `/blog/${slug}` }, type: "article", publishedTime: post.date, kicker: "Blog" });
}

export default function PostPage({ params }: PageProps<"/[locale]/blog/[slug]">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto my-16 h-[40rem] w-full max-w-3xl" />}>
      <Post params={params} />
    </Suspense>
  );
}

async function Post({ params }: Pick<PageProps<"/[locale]/blog/[slug]">, "params">) {
  const { locale, slug } = await params;
  setRequestLocale(locale as Locale);
  const post = findPost(slug);
  if (!post) notFound();
  const [t, format, Body] = await Promise.all([getTranslations("blog"), getFormatter(), loadPost(slug, locale as Locale)]);
  const meta = post[locale as Locale];

  return (
    <main className="mx-auto grid w-full max-w-3xl gap-10 px-4 py-16 sm:px-6 sm:py-20">
      <Link href="/blog" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" aria-hidden />
        {t("allPosts")}
      </Link>
      <article className="grid gap-6">
        <header className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            <time dateTime={post.date}>{format.dateTime(new Date(`${post.date}T12:00:00Z`), { day: "numeric", month: "long", year: "numeric" })}</time> ·{" "}
            {t("minutes", { count: post.readingMinutes })}
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-balance">{meta.title}</h1>
          <p className="text-lg text-muted-foreground">{meta.description}</p>
        </header>
        <div className="text-[1.0625rem] text-foreground/90">
          <Body />
        </div>
      </article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd({
          "@type": "BlogPosting",
          headline: meta.title,
          description: meta.description,
          datePublished: post.date,
          inLanguage: locale,
          url: siteUrl(locale as Locale, `/blog/${slug}`),
          publisher: { "@type": "Organization", name: "StageDesk" },
        })}
      />
      <section className="grid gap-6 border-t pt-10" aria-labelledby="comments">
        <h2 id="comments" className="text-xl font-semibold">
          {t("comments")}
        </h2>
        <Suspense fallback={<Skeleton className="h-24 w-full" />}>
          <Comments slug={slug} locale={locale as Locale} />
        </Suspense>
        <CommentForm slug={slug} turnstileKey={turnstileSiteKey()} />
      </section>
    </main>
  );
}

async function Comments({ slug, locale }: { slug: string; locale: Locale }) {
  await connection();
  const [t, format, comments] = await Promise.all([
    getTranslations("blog"),
    getFormatter(),
    prisma.blogComment.findMany({ where: { postSlug: slug, locale, status: "approved" }, orderBy: { createdAt: "asc" }, take: 200 }),
  ]);
  if (comments.length === 0) return <p className="text-muted-foreground">{t("noComments")}</p>;
  return (
    <ol className="grid gap-4">
      {comments.map((c) => (
        <li key={c.id} className="grid gap-1 rounded-xl border bg-card p-4">
          <p className="text-sm">
            <span className="font-medium">{c.authorName}</span>{" "}
            <span className="text-muted-foreground">· {format.dateTime(c.createdAt, { day: "numeric", month: "short", year: "numeric" })}</span>
          </p>
          <p className="whitespace-pre-line">{c.body}</p>
        </li>
      ))}
    </ol>
  );
}
