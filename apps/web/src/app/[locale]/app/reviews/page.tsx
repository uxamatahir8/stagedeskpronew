import { StarIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Stars } from "@/components/stars";
import { Pill, type Tone } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { dateTime } from "@/lib/format";
import { requireAgency } from "@/lib/viewer";
import { ModerateReview } from "./moderate-review";
import { CardList } from "@/components/list/data-table";

const tone: Record<string, Tone> = { pending: "warning", approved: "success", rejected: "neutral" };

export async function generateMetadata({ params }: PageProps<"/[locale]/app/reviews">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "reviews" });
  return { title: t("title") };
}

export default async function ReviewsPage({ params }: PageProps<"/[locale]/app/reviews">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Reviews />
    </Suspense>
  );
}

const spec = { sorts: ["queue", "date", "rating"], defaultSort: "queue", defaultDir: "asc" as const, filters: { status: ["pending", "approved", "rejected"], rating: ["1", "2", "3", "4", "5"] } };

async function Reviews() {
  const { db } = await requireAgency("agency.reviews");
  const [t, format, reviews] = await Promise.all([
    getTranslations("reviews"),
    getFormatter(),
    db.review.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        customer: { select: { name: true } },
        artist: { select: { stageName: true } },
        booking: { select: { trackingCode: true } },
      },
    }),
  ]);

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      {reviews.length === 0 ? (
        <EmptyState icon={StarIcon} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <CardList
          spec={spec}
          placeholder={t("searchPlaceholder")}
          className="grid gap-4"
          sorts={[{ key: "queue", label: t("sortQueue") }, { key: "date", label: t("sortDate") }, { key: "rating", label: t("sortRating") }]}
          filters={[
            { key: "status", label: t("statusLabel"), options: [...new Set(reviews.map((r) => r.status))].map((st) => ({ value: st, label: t(`status_${st as "pending"}`) })) },
            { key: "rating", label: t("sortRating"), options: [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: "★".repeat(n) })) },
          ]}
          items={reviews.map((r) => ({
            id: r.id,
            text: `${r.customer.name} ${r.artist?.stageName ?? ""} ${r.comment ?? ""} ${r.booking.trackingCode}`,
            // Waiting for moderation first, newest first within each group.
            values: { queue: `${r.status === "pending" ? 0 : 1}-${String(9e12 - r.createdAt.getTime()).padStart(14, "0")}`, date: r.createdAt.getTime(), rating: r.rating },
            facets: { status: r.status, rating: String(r.rating) },
            node: (
              <Card>
                <CardContent className="grid gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <Stars rating={r.rating} />
                      <span className="font-medium">{r.customer.name}</span>
                      {r.artist && <span className="text-muted-foreground">· {r.artist.stageName}</span>}
                      <Pill tone={tone[r.status] ?? "neutral"}>{t(`status_${r.status as "pending"}`)}</Pill>
                    </div>
                    {r.status === "pending" && <ModerateReview reviewId={r.id} />}
                  </div>
                  {r.comment && <p className="text-sm whitespace-pre-line">{r.comment}</p>}
                  <p className="text-xs text-muted-foreground">
                    {dateTime(format, r.createdAt)} ·{" "}
                    <Link href={`/app/bookings/${r.booking.trackingCode}`} className="font-mono hover:underline">
                      {r.booking.trackingCode}
                    </Link>
                  </p>
                </CardContent>
              </Card>
            ),
          }))}
        />
      )}
    </div>
  );
}
