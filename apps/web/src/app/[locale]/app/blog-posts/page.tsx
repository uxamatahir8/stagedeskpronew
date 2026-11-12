import { FileTextIcon, PlusIcon } from "lucide-react";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { contributorArticles } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Pill, type Tone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requirePermission } from "@/lib/viewer";
import { WithdrawButton } from "./withdraw-button";

const tones: Record<string, Tone> = { draft: "neutral", pending: "info", published: "success", rejected: "danger" };

export default async function BlogPostsPage({ params }: PageProps<"/[locale]/app/blog-posts">) {
  setRequestLocale((await params).locale as Locale);
  return <Suspense fallback={<Skeleton className="h-80" />}><Posts /></Suspense>;
}

async function Posts() {
  const viewer = await requirePermission("blog.submit");
  const [t, rows] = await Promise.all([getTranslations("blogContributions"), contributorArticles(viewer.user.id)]);
  return <div className="grid gap-6">
    <PageHeader title={t("title")} description={t("description")} actions={<Button asChild><Link href="/app/blog-posts/new"><PlusIcon />{t("new")}</Link></Button>} />
    {rows.length === 0 ? <EmptyState icon={FileTextIcon} title={t("empty")} /> : <div className="grid gap-3">
      {rows.map((row) => {
        const editable = row.status === "draft" || row.status === "rejected";
        const body = <Card><CardContent className="flex items-center justify-between gap-4 py-4">
          <div><p className="font-medium">{(row.nl as { title?: string }).title || row.slug}</p><p className="text-sm text-muted-foreground">/{row.slug}</p>{row.rejectionReason && <p className="mt-1 text-sm text-destructive">{row.rejectionReason}</p>}</div>
          <div className="flex items-center gap-2"><Pill tone={tones[row.status] ?? "neutral"}>{t(`status_${row.status as "draft"}`)}</Pill>{row.status === "pending" && <WithdrawButton id={row.id} />}</div>
        </CardContent></Card>;
        return editable ? <Link key={row.id} href={`/app/blog-posts/${row.id}`} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{body}</Link> : <div key={row.id}>{body}</div>;
      })}
    </div>}
  </div>;
}
