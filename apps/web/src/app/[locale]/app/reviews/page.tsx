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
        <ul className="grid gap-4">
          {reviews.map((r) => (
            <li key={r.id}>
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
