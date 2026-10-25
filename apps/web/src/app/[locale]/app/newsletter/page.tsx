import { MailCheckIcon, MailPlusIcon, MailXIcon, PlusIcon, SendIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import { campaignStatuses, listSubscribers, type Prisma, prisma, subscriberSources, subscriberStatuses } from "@stagedesk/db";
import { pageWindow, parseListQuery } from "@stagedesk/core";
import { EmptyState } from "@/components/empty-state";
import { ServerTable } from "@/components/list/data-table";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Pill, type Tone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/lib/viewer";
import { AddSubscriberDialog, SubscriberMenu } from "./subscriber-controls";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/newsletter">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "newsletter" });
  return { title: t("title") };
}

export default async function NewsletterPage({ params, searchParams }: PageProps<"/[locale]/app/newsletter">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-[36rem] w-full" />}>
      <Newsletter searchParams={searchParams} />
    </Suspense>
  );
}

const campaignTone: Record<string, Tone> = { draft: "neutral", scheduled: "info", sending: "warning", sent: "success", cancelled: "danger" };
const subscriberTone: Record<string, Tone> = { pending: "warning", subscribed: "success", unsubscribed: "neutral" };

const campaignSpec = { sorts: ["created", "subject", "sent"], defaultSort: "created", defaultDir: "desc" as const, filters: { tab: ["campaigns", "subscribers"], status: [...campaignStatuses] } };
const subscriberSpec = {
  sorts: ["created", "email", "name", "confirmed"],
  defaultSort: "created",
  defaultDir: "desc" as const,
  filters: { tab: ["campaigns", "subscribers"], status: [...subscriberStatuses], locale: ["nl", "en"], source: [...subscriberSources] },
};

async function Newsletter({ searchParams }: Pick<PageProps<"/[locale]/app/newsletter">, "searchParams">) {
  await requirePermission("platform.newsletter");
  const raw = await searchParams;
  const tab = raw["tab"] === "subscribers" ? "subscribers" : "campaigns";
  const [t, counts, sentCampaigns] = await Promise.all([
    getTranslations("newsletter"),
    prisma.newsletterSubscriber.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.newsletterCampaign.count({ where: { status: "sent" } }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;
  const tabHref = (k: string) => (k === "campaigns" ? "/app/newsletter" : `/app/newsletter?tab=${k}`);

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button asChild>
            <Link href="/app/newsletter/new">
              <PlusIcon />
              {t("newCampaign")}
            </Link>
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} label={t("statSubscribed")} value={count("subscribed")} icon={MailCheckIcon} tone="teal" />
        <StatCard index={1} label={t("statPending")} value={count("pending")} icon={MailPlusIcon} tone="blue" />
        <StatCard index={2} label={t("statUnsubscribed")} value={count("unsubscribed")} icon={MailXIcon} tone="pink" />
        <StatCard index={3} label={t("statCampaigns")} value={sentCampaigns} icon={SendIcon} tone="violet" />
      </div>
      <nav className="flex w-fit gap-1 rounded-lg bg-muted p-1 text-sm" aria-label={t("title")}>
        {(["campaigns", "subscribers"] as const).map((k) => (
          <Link key={k} href={tabHref(k)} aria-current={k === tab ? "page" : undefined} className={cn("rounded-md px-3 py-1.5", k === tab ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}>
            {t(`tab_${k}`)}
          </Link>
        ))}
      </nav>
      {tab === "campaigns" ? <Campaigns raw={raw} /> : <Subscribers raw={raw} />}
    </div>
  );
}

async function Campaigns({ raw }: { raw: Record<string, string | string[] | undefined> }) {
  const query = parseListQuery(raw, campaignSpec);
  const where: Prisma.NewsletterCampaignWhereInput = {
    ...(query.filters.status ? { status: query.filters.status } : {}),
    ...(query.q ? { OR: [{ subjectNl: { contains: query.q } }, { subjectEn: { contains: query.q } }] } : {}),
  };
  const [t, format, total, any] = await Promise.all([getTranslations("newsletter"), getFormatter(), prisma.newsletterCampaign.count({ where }), prisma.newsletterCampaign.count()]);
  const win = pageWindow(query, total);
  const rows = await prisma.newsletterCampaign.findMany({
    where,
    orderBy: query.sort === "subject" ? { subjectNl: query.dir } : query.sort === "sent" ? { sentAt: { sort: query.dir, nulls: "last" } } : { createdAt: query.dir },
    skip: win.skip,
    take: win.take,
  });
  if (any === 0) return <EmptyState icon={SendIcon} title={t("noCampaigns")} description={t("noCampaignsHint")} />;
  const when = (d: Date) => format.dateTime(d, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <ServerTable
      spec={campaignSpec}
      total={total}
      count={rows.length}
      placeholder={t("searchCampaigns")}
      filters={[{ key: "status", label: t("status"), options: campaignStatuses.map((s) => ({ value: s, label: t(`status_${s}`) })) }]}
      columns={[{ label: t("subject"), sort: "subject" }, { label: t("status") }, { label: t("audience") }, { label: t("recipients"), align: "right" }, { label: t("created"), sort: "created" }, { label: t("status_sent"), sort: "sent" }]}
    >
      {rows.map((c) => (
        <TableRow key={c.id} className="relative">
          <TableCell className="max-w-md">
            <Link href={`/app/newsletter/${c.id}`} className="font-medium after:absolute after:inset-0 hover:underline">
              {c.subjectNl}
            </Link>
            <div className="truncate text-xs text-muted-foreground">{c.subjectEn}</div>
          </TableCell>
          <TableCell>
            <Pill tone={campaignTone[c.status] ?? "neutral"}>{t(`status_${c.status as "draft"}`)}</Pill>
            {c.status === "scheduled" && c.scheduledAt && <div className="mt-1 text-xs text-muted-foreground">{when(c.scheduledAt)}</div>}
          </TableCell>
          <TableCell className="text-sm">{t(`audience_${c.audience as "all"}`)}</TableCell>
          <TableCell className="text-right tabular-nums">
            {c.recipients ? t("progress", { sent: c.sentCount, total: c.recipients }) : "—"}
            {c.failedCount > 0 && <div className="text-xs text-destructive">{t("failed", { count: c.failedCount })}</div>}
          </TableCell>
          <TableCell className="whitespace-nowrap text-sm tabular-nums">{when(c.createdAt)}</TableCell>
          <TableCell className="whitespace-nowrap text-sm tabular-nums">{c.sentAt ? when(c.sentAt) : "—"}</TableCell>
        </TableRow>
      ))}
    </ServerTable>
  );
}

async function Subscribers({ raw }: { raw: Record<string, string | string[] | undefined> }) {
  const query = parseListQuery(raw, subscriberSpec);
  const win0 = { skip: (query.page - 1) * query.size, take: query.size };
  const [t, format, list] = await Promise.all([
    getTranslations("newsletter"),
    getFormatter(),
    listSubscribers({ q: query.q, status: query.filters.status, locale: query.filters.locale, source: query.filters.source, sort: query.sort, dir: query.dir, ...win0 }),
  ]);
  const tl = await getTranslations("languages");
  const day = (d: Date | null) => (d ? format.dateTime(d, { day: "numeric", month: "short", year: "numeric" }) : "—");
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap justify-end gap-2">
        <Button asChild variant="outline" size="sm">
          <a href="/api/export/newsletter" download>
            {t("exportCsv")}
          </a>
        </Button>
        <AddSubscriberDialog />
      </div>
      <ServerTable
        spec={subscriberSpec}
        total={list.total}
        count={list.rows.length}
        placeholder={t("searchSubscribers")}
        filters={[
          { key: "status", label: t("status"), options: subscriberStatuses.map((s) => ({ value: s, label: t(`subStatus_${s}`) })) },
          { key: "locale", label: t("language"), options: [{ value: "nl", label: tl("nl") }, { value: "en", label: tl("en") }] },
          { key: "source", label: t("source"), options: subscriberSources.map((s) => ({ value: s, label: t(`source_${s}`) })) },
        ]}
        columns={[
          { label: t("subscriberEmail"), sort: "email" },
          { label: t("subscriberName"), sort: "name" },
          { label: t("status") },
          { label: t("language") },
          { label: t("source") },
          { label: t("since"), sort: "created" },
          { label: t("confirmedOn"), sort: "confirmed" },
          { label: "", className: "w-0" },
        ]}
      >
        {list.rows.map((s) => (
          <TableRow key={s.id}>
            <TableCell className="font-medium">{s.email}</TableCell>
            <TableCell>{s.name ?? "—"}</TableCell>
            <TableCell>
              <Pill tone={subscriberTone[s.status] ?? "neutral"}>{t(`subStatus_${s.status as "pending"}`)}</Pill>
            </TableCell>
            <TableCell className="uppercase">{s.locale}</TableCell>
            <TableCell>{t(`source_${s.source as "footer"}`)}</TableCell>
            <TableCell className="whitespace-nowrap tabular-nums">{day(s.createdAt)}</TableCell>
            <TableCell className="whitespace-nowrap tabular-nums">{day(s.confirmedAt)}</TableCell>
            <TableCell className="text-right">
              <SubscriberMenu id={s.id} email={s.email} subscribed={s.status !== "unsubscribed"} />
            </TableCell>
          </TableRow>
        ))}
      </ServerTable>
    </div>
  );
}

