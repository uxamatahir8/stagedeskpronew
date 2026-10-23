import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { blocksToLines, diffLines } from "@stagedesk/core";
import { parsePageContent, prisma } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/lib/viewer";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/pages/[id]/compare">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "pageBuilder" });
  return { title: t("compare") };
}

export default function ComparePage({ params, searchParams }: PageProps<"/[locale]/app/pages/[id]/compare">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Compare params={params} searchParams={searchParams} />
    </Suspense>
  );
}

/** Line-by-line difference between two versions, in both languages. */
async function Compare({ params, searchParams }: Pick<PageProps<"/[locale]/app/pages/[id]/compare">, "params" | "searchParams">) {
  setRequestLocale((await params).locale as Locale);
  await requirePermission("platform.pages");
  const { id } = await params;
  const query = await searchParams;
  const [from, to] = await Promise.all(
    [query["from"], query["to"]].map((v) => (typeof v === "string" ? prisma.pageVersion.findFirst({ where: { id: v, pageId: id } }) : null)),
  );
  const a = parsePageContent(from?.content);
  const b = parsePageContent(to?.content);
  if (!from || !to || !a || !b) notFound();
  const t = await getTranslations("pageBuilder");

  return (
    <div className="grid gap-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href={`/app/pages/${id}`}>
          <ArrowLeftIcon />
          {t("backToPage")}
        </Link>
      </Button>
      <PageHeader title={t("compareTitle", { from: from.number, to: to.number })} description={t("compareHint")} />
      {(["nl", "en"] as const).map((lang) => {
        const diff = diffLines(blocksToLines(a[lang]), blocksToLines(b[lang]));
        const changed = diff.some((d) => d.op !== "same");
        return (
          <Card key={lang}>
            <CardHeader>
              <CardTitle>{lang === "nl" ? "Nederlands" : "English"}</CardTitle>
            </CardHeader>
            <CardContent>
              {!changed ? (
                <p className="text-sm text-muted-foreground">{t("noChanges")}</p>
              ) : (
                <ol className="grid gap-0.5 font-mono text-sm">
                  {diff.map((d, i) => (
                    <li
                      key={i}
                      className={cn(
                        "rounded px-2 py-0.5 whitespace-pre-wrap",
                        d.op === "add" && "bg-success/12",
                        d.op === "del" && "bg-destructive/10 text-muted-foreground line-through",
                        d.op === "same" && "text-muted-foreground",
                      )}
                    >
                      <span className="mr-2 inline-block w-3 select-none" aria-label={d.op === "add" ? t("added") : d.op === "del" ? t("removed") : undefined}>
                        {d.op === "add" ? "+" : d.op === "del" ? "−" : " "}
                      </span>
                      {d.text}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
