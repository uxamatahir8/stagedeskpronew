import { ContactIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState } from "@/components/empty-state";
import { ExportButton } from "@/components/export-button";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Locale } from "@/i18n/routing";
import { requireAgency } from "@/lib/viewer";
import { AddCustomerDialog } from "./add-customer-dialog";
import { IfCan } from "@/components/if-can";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/customers">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "customers" });
  return { title: t("title") };
}

export default async function CustomersPage({ params }: PageProps<"/[locale]/app/customers">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Customers />
    </Suspense>
  );
}

async function Customers() {
  const { db } = await requireAgency("agency.customers");
  const [t, ta, format, customers] = await Promise.all([
    getTranslations("customers"),
    getTranslations("auth"),
    getFormatter(),
    db.member.findMany({
      where: { role: "customer" },
      include: { user: { select: { name: true, email: true, phone: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="grid gap-8">
      <PageHeader title={t("title")} description={t("description")} actions={
          <div className="flex flex-wrap gap-2">
            <ExportButton kind="customers" />
            <IfCan permission="agency.customers.manage">
              <AddCustomerDialog />
            </IfCan>
          </div>
        }
      />
      {customers.length === 0 ? (
        <EmptyState icon={ContactIcon} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{ta("name")}</TableHead>
                  <TableHead>{ta("email")}</TableHead>
                  <TableHead>{t("phone")}</TableHead>
                  <TableHead>{t("since")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.user.name}</TableCell>
                    <TableCell>{c.user.email}</TableCell>
                    <TableCell className="tabular-nums">{c.user.phone ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {format.dateTime(c.createdAt, { day: "numeric", month: "short", year: "numeric" })}
                    </TableCell>
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
