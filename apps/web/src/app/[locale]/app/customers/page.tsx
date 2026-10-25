import { ContactIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import { pageWindow, parseListQuery } from "@stagedesk/core";
import type { Prisma } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { ExportButton } from "@/components/export-button";
import { IfCan } from "@/components/if-can";
import { ServerTable } from "@/components/list/data-table";
import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import type { Locale } from "@/i18n/routing";
import { requireAgency } from "@/lib/viewer";
import { AddCustomerDialog } from "./add-customer-dialog";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/customers">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "customers" });
  return { title: t("title") };
}

export default async function CustomersPage({ params, searchParams }: PageProps<"/[locale]/app/customers">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Customers searchParams={searchParams} />
    </Suspense>
  );
}

const spec = { sorts: ["since", "name", "email"], defaultSort: "since", defaultDir: "desc" as const, filters: { account: ["yes", "no"] } };

async function Customers({ searchParams }: Pick<PageProps<"/[locale]/app/customers">, "searchParams">) {
  const { db, organization } = await requireAgency("agency.customers");
  const query = parseListQuery(await searchParams, spec);
  // Search and the account filter both narrow the customer's user.
  const user: Prisma.UserWhereInput[] = [];
  if (query.q) user.push({ OR: [{ name: { contains: query.q } }, { email: { contains: query.q } }, { phone: { contains: query.q } }] });
  if (query.filters.account === "yes") user.push({ accounts: { some: { providerId: "credential" } } });
  if (query.filters.account === "no") user.push({ accounts: { none: { providerId: "credential" } } });
  const where: Prisma.MemberWhereInput = { role: "customer", ...(user.length ? { user: { AND: user } } : {}) };
  const orderBy: Prisma.MemberOrderByWithRelationInput =
    query.sort === "name" ? { user: { name: query.dir } } : query.sort === "email" ? { user: { email: query.dir } } : { createdAt: query.dir };

  const [t, format, total, anyCustomer] = await Promise.all([
    getTranslations("customers"),
    getFormatter(),
    db.member.count({ where }),
    db.member.count({ where: { role: "customer" } }),
  ]);
  const win = pageWindow(query, total);
  const customers = await db.member.findMany({
    where,
    orderBy,
    skip: win.skip,
    take: win.take,
    include: {
      user: {
        select: {
          name: true,
          email: true,
          phone: true,
          accounts: { where: { providerId: "credential" }, select: { id: true } },
          _count: { select: { bookings: { where: { organizationId: organization.id } } } },
        },
      },
    },
  });

  return (
    <div className="grid gap-8">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportButton kind="customers" />
            <IfCan permission="agency.customers.manage">
              <AddCustomerDialog />
            </IfCan>
          </div>
        }
      />
      {anyCustomer === 0 ? (
        <EmptyState icon={ContactIcon} title={t("emptyTitle")} description={t("emptyBody")} />
      ) : (
        <ServerTable
          spec={spec}
          total={total}
          count={customers.length}
          placeholder={t("searchPlaceholder")}
          filters={[{ key: "account", label: t("account"), options: [{ value: "yes", label: t("accountYes") }, { value: "no", label: t("accountNo") }] }]}
          columns={[
            { label: t("name"), sort: "name" },
            { label: t("email"), sort: "email" },
            { label: t("phone") },
            { label: t("bookings"), align: "right" },
            { label: t("account") },
            { label: t("since"), sort: "since" },
          ]}
        >
          {customers.map((c) => (
            <TableRow key={c.id}>
              <TableCell className="font-medium">{c.user.name}</TableCell>
              <TableCell>{c.user.email}</TableCell>
              <TableCell className="tabular-nums">{c.user.phone ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums">{c.user._count.bookings}</TableCell>
              <TableCell>{c.user.accounts.length > 0 ? <Pill tone="success">{t("accountYes")}</Pill> : <Pill>{t("accountNo")}</Pill>}</TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">{format.dateTime(c.createdAt, { day: "numeric", month: "short", year: "numeric" })}</TableCell>
            </TableRow>
          ))}
        </ServerTable>
      )}
    </div>
  );
}
