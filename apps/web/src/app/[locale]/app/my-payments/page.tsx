import { CreditCardIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { type EventType, paymentStatus } from "@stagedesk/core";
import { FormMessage } from "@/components/auth/auth-card";
import { PayPanel } from "@/components/booking/pay-panel";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PaymentStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Locale } from "@/i18n/routing";
import { euro, eventDate } from "@/lib/format";
import { payBookingAction } from "@/lib/pay-actions";
import { requireAgency } from "@/lib/viewer";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/my-payments">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "myPayments" });
  return { title: t("title") };
}

export default async function MyPaymentsPage({ params, searchParams }: PageProps<"/[locale]/app/my-payments">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <MyPayments searchParams={searchParams} />
    </Suspense>
  );
}

async function MyPayments({ searchParams }: Pick<PageProps<"/[locale]/app/my-payments">, "searchParams">) {
  const { viewer, db } = await requireAgency("customer.payments");
  const [t, format, query] = await Promise.all([getTranslations(), getFormatter(), searchParams]);

  // Only the signed-in customer's own bookings at this agency.
  const bookings = await db.booking.findMany({
    where: { customerId: viewer.user.id, totalCents: { gt: 0 }, status: { notIn: ["cancelled", "declined"] } },
    orderBy: { eventDate: { sort: "asc", nulls: "last" } },
    include: { payments: { orderBy: { receivedAt: "desc" } } },
  });
  const payments = bookings.flatMap((b) => b.payments.map((p) => ({ ...p, trackingCode: b.trackingCode })));
  payments.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
  const open = bookings.filter((b) => b.paidCents < b.totalCents);

  if (bookings.length === 0) {
    return (
      <div className="grid gap-6">
        <PageHeader title={t("myPayments.title")} description={t("myPayments.description")} />
        <EmptyState icon={CreditCardIcon} title={t("myPayments.empty")} />
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader title={t("myPayments.title")} description={t("myPayments.description")} />
      {query["paid"] === "1" && <FormMessage tone="success">{t("pay.thanks")}</FormMessage>}
      {query["paid"] === "0" && <FormMessage>{t("pay.cancelled")}</FormMessage>}

      {open.length > 0 && (
        <section className="grid gap-4">
          <h2 className="font-medium">{t("myPayments.due")}</h2>
          {open.map((b) => (
            <Card key={b.id}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {t(`eventTypes.${b.eventType as EventType}`)}
                  {b.eventDate && <span className="font-normal text-muted-foreground">· {eventDate(format, b.eventDate)}</span>}
                  <PaymentStatusBadge status={paymentStatus(b.paidCents, b.totalCents, b.depositCents)} />
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <p>{t("customerEvent.paidOf", { paid: euro(format, b.paidCents), total: euro(format, b.totalCents) })}</p>
                <PayPanel booking={b} pay={payBookingAction.bind(null, b.id, "payments")} />
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("myPayments.history")}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("myPayments.empty")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("payments.date")}</TableHead>
                  <TableHead>{t("payments.booking")}</TableHead>
                  <TableHead>{t("payments.method")}</TableHead>
                  <TableHead className="text-right">{t("payments.amount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap tabular-nums">{eventDate(format, p.receivedAt, "short")}</TableCell>
                    <TableCell className="font-mono text-sm">{p.trackingCode}</TableCell>
                    <TableCell>
                      {t(`paymentKinds.${p.kind as "deposit"}`)} · {t(`paymentMethods.${p.method as "cash"}`)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{euro(format, p.amountCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
