import { CreditCardIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import { type EventType, paymentStatus } from "@stagedesk/core";
import { FormMessage } from "@/components/auth/auth-card";
import { PayPanel } from "@/components/booking/pay-panel";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PaymentStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/list/data-table";
import type { Locale } from "@/i18n/routing";
import { euro, eventDate } from "@/lib/format";
import { payBookingAction, reportPaymentAction } from "@/lib/pay-actions";
import { requireAgency } from "@/lib/viewer";
import { confirmCheckoutReturn } from "@/lib/checkout-return";

const spec = { sorts: ["date", "booking", "amount"], defaultSort: "date", defaultDir: "desc" as const, filters: { kind: ["deposit", "balance", "refund", "other"] } };

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
  const { viewer, organization, db } = await requireAgency("customer.payments");
  await confirmCheckoutReturn((await searchParams)["session_id"], { organizationId: organization.id });
  const [t, format, query] = await Promise.all([getTranslations(), getFormatter(), searchParams]);

  // Only the signed-in customer's own bookings at this agency.
  const bookings = await db.booking.findMany({
    where: { customerId: viewer.user.id, totalCents: { gt: 0 }, status: { notIn: ["cancelled", "declined"] } },
    orderBy: { eventDate: { sort: "asc", nulls: "last" } },
    include: { payments: { orderBy: { receivedAt: "desc" } } },
  });
  const payments = bookings.flatMap((b) => b.payments.map((p) => ({ ...p, trackingCode: b.trackingCode, currency: b.currency })));
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
                <p>{t("customerEvent.paidOf", { paid: euro(format, b.paidCents, b.currency), total: euro(format, b.totalCents, b.currency) })}</p>
                <PayPanel booking={b} pay={payBookingAction.bind(null, b.id, "payments")} report={reportPaymentAction.bind(null, b.id)} />
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      <section className="grid gap-3">
        <h2 className="font-medium">{t("myPayments.history")}</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("myPayments.empty")}</p>
        ) : (
          <DataTable
            spec={spec}
            placeholder={t("myPayments.searchPlaceholder")}
            filters={[{ key: "kind", label: t("myPayments.kind"), options: [...new Set(payments.map((p) => p.kind))].map((k) => ({ value: k, label: t(`paymentKinds.${k as "deposit"}`) })) }]}
            columns={[
              { label: t("payments.date"), sort: "date" },
              { label: t("payments.booking"), sort: "booking" },
              { label: t("payments.method") },
              { label: t("payments.amount"), sort: "amount", align: "right" },
            ]}
            rows={payments.map((p) => ({
              id: p.id,
              text: `${p.trackingCode} ${p.reference ?? ""}`,
              values: { date: p.receivedAt.getTime(), booking: p.trackingCode, amount: p.amountCents },
              facets: { kind: p.kind },
              cells: [
                eventDate(format, p.receivedAt, "short"),
                <span key="c" className="font-mono text-sm">{p.trackingCode}</span>,
                `${t(`paymentKinds.${p.kind as "deposit"}`)} · ${t(`paymentMethods.${p.method as "cash"}`)}`,
                <span key="a" className="font-medium">{euro(format, p.amountCents, p.currency)}</span>,
              ],
            }))}
          />
        )}
      </section>
    </div>
  );
}
