import { ReceiptIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Pill, type Tone } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { dateTime, euro } from "@/lib/format";
import { requireAgency } from "@/lib/viewer";

const tone: Record<string, Tone> = { sent: "info", accepted: "success", superseded: "neutral", declined: "danger", draft: "neutral" };

export async function generateMetadata({ params }: PageProps<"/[locale]/app/quotes">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "quotes" });
  return { title: t("title") };
}

export default async function QuotesPage({ params }: PageProps<"/[locale]/app/quotes">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Quotes />
    </Suspense>
  );
}

async function Quotes() {
  const { db } = await requireAgency("agency.quotes");
  const [t, tb, ts, format, quotes] = await Promise.all([
    getTranslations("quotes"),
    getTranslations("bookings"),
    getTranslations("quoteStatus"),
    getFormatter(),
    db.quote.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { booking: { select: { trackingCode: true, customer: { select: { name: true } } } } },
    }),
  ]);
  const now = new Date();

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} />
      {quotes.length === 0 ? (
        <EmptyState icon={ReceiptIcon} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tb("customer")}</TableHead>
                  <TableHead>{t("version")}</TableHead>
                  <TableHead>{tb("status")}</TableHead>
                  <TableHead>{t("expires")}</TableHead>
                  <TableHead className="text-right">{tb("total")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map((q) => (
                  <TableRow key={q.id} className="relative">
                    <TableCell>
                      <Link href={`/app/bookings/${q.booking.trackingCode}`} className="font-medium after:absolute after:inset-0 hover:underline">
                        {q.booking.customer?.name ?? tb("noCustomer")}
                      </Link>
                      <div className="font-mono text-xs text-muted-foreground">{q.booking.trackingCode}</div>
                    </TableCell>
                    <TableCell className="tabular-nums">{q.version}</TableCell>
                    <TableCell>
                      <Pill tone={tone[q.status] ?? "neutral"}>{ts(q.status as "sent")}</Pill>
                    </TableCell>
                    <TableCell className={q.status === "sent" && q.expiresAt < now ? "text-destructive" : undefined}>
                      {q.status === "sent" ? dateTime(format, q.expiresAt) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{euro(format, q.totalCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
