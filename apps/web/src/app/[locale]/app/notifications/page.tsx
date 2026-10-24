import {
  BanknoteIcon,
  BellIcon,
  CalendarClockIcon,
  CircleCheckIcon,
  HandCoinsIcon,
  InboxIcon,
  LifeBuoyIcon,
  type LucideIcon,
  MessageSquareIcon,
  MessageSquareTextIcon,
  Music2Icon,
  ReceiptIcon,
  SparklesIcon,
} from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { listNotifications } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { FilterChips, Pager } from "@/components/list-controls";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Locale } from "@/i18n/routing";
import { daysAgo } from "@/lib/format";
import { requireViewer } from "@/lib/viewer";
import { NotificationRow, NotificationsToolbar } from "./controls";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/notifications">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "notificationsPage" });
  return { title: t("title") };
}

export default async function NotificationsPage({ params, searchParams }: PageProps<"/[locale]/app/notifications">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Notifications searchParams={searchParams} />
    </Suspense>
  );
}

/** An icon per kind of notification, so the list can be scanned. */
const icons: Record<string, { icon: LucideIcon; tone: string }> = {
  new_inquiry: { icon: InboxIcon, tone: "bg-primary/12 text-primary" },
  quote_accepted: { icon: CircleCheckIcon, tone: "bg-success/15 text-success" },
  gig_request: { icon: Music2Icon, tone: "bg-magenta/12 text-magenta" },
  gig_response: { icon: Music2Icon, tone: "bg-magenta/12 text-magenta" },
  payment_received: { icon: BanknoteIcon, tone: "bg-success/15 text-success" },
  message: { icon: MessageSquareIcon, tone: "bg-info/12 text-info" },
  ticket_new: { icon: LifeBuoyIcon, tone: "bg-warning/18 text-foreground" },
  ticket_reply: { icon: LifeBuoyIcon, tone: "bg-warning/18 text-foreground" },
  reminder_event: { icon: CalendarClockIcon, tone: "bg-chart-2/14 text-chart-2" },
  commission_approved: { icon: HandCoinsIcon, tone: "bg-success/15 text-success" },
  withdrawal_requested: { icon: HandCoinsIcon, tone: "bg-info/12 text-info" },
  withdrawal_approved: { icon: HandCoinsIcon, tone: "bg-success/15 text-success" },
  withdrawal_paid: { icon: HandCoinsIcon, tone: "bg-success/15 text-success" },
  withdrawal_rejected: { icon: HandCoinsIcon, tone: "bg-destructive/12 text-destructive" },
  comment_new: { icon: MessageSquareTextIcon, tone: "bg-info/12 text-info" },
  lead_new: { icon: SparklesIcon, tone: "bg-magenta/12 text-magenta" },
  lead_offer: { icon: SparklesIcon, tone: "bg-magenta/12 text-magenta" },
  lead_accepted: { icon: CircleCheckIcon, tone: "bg-success/15 text-success" },
  payment_reported: { icon: BanknoteIcon, tone: "bg-info/12 text-info" },
  payment_confirmed: { icon: CircleCheckIcon, tone: "bg-success/15 text-success" },
  payment_rejected: { icon: BanknoteIcon, tone: "bg-warning/18 text-foreground" },
};
const fallback = { icon: ReceiptIcon, tone: "bg-muted text-muted-foreground" };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

async function Notifications({ searchParams }: Pick<PageProps<"/[locale]/app/notifications">, "searchParams">) {
  await connection();
  const viewer = await requireViewer();
  const sp = await searchParams;
  const unreadOnly = one(sp["show"]) === "unread";
  const page = Math.max(1, Number.parseInt(one(sp["page"]) ?? "1", 10) || 1);
  const [t, tn, format, list] = await Promise.all([
    getTranslations("notificationsPage"),
    getTranslations("notifications"),
    getFormatter(),
    listNotifications(viewer.user.id, { unreadOnly, page }),
  ]);

  const href = (patch: { unread?: boolean; page?: number }) => {
    const next = new URLSearchParams();
    if (patch.unread ?? unreadOnly) next.set("show", "unread");
    if (patch.page && patch.page > 1) next.set("page", String(patch.page));
    const s = next.toString();
    return `/app/notifications${s ? `?${s}` : ""}`;
  };
  const text = (type: string, data: Record<string, string | number>) => {
    // Amounts are stored in cents; the messages format euros.
    const values = "cents" in data ? { ...data, amount: Number(data["cents"]) / 100 } : data;
    return tn.has(type as "message") ? tn(type as "message", values as never) : type;
  };

  // Group by calendar day: today, yesterday, then the date.
  const dayKey = (d: Date) => format.dateTime(d, { year: "numeric", month: "2-digit", day: "2-digit" });
  const today = dayKey(daysAgo(0));
  const yesterday = dayKey(daysAgo(1));
  const groups = new Map<string, { label: string; items: typeof list.items }>();
  for (const n of list.items) {
    const key = dayKey(n.createdAt);
    const label = key === today ? t("today") : key === yesterday ? t("yesterday") : format.dateTime(n.createdAt, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const group = groups.get(key) ?? { label, items: [] };
    group.items.push(n);
    groups.set(key, group);
  }

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t("description")} actions={<NotificationsToolbar unread={list.unread} />} />
      <FilterChips
        label={t("filter")}
        options={[
          { key: "all", label: t("all"), href: href({ unread: false }), active: !unreadOnly },
          { key: "unread", label: t("unread", { count: list.unread }), href: href({ unread: true }), active: unreadOnly },
        ]}
      />
      {list.items.length === 0 ? (
        <EmptyState icon={BellIcon} title={unreadOnly ? t("emptyUnread") : t("empty")} description={t("emptyHint")} />
      ) : (
        [...groups.values()].map((g) => (
          <section key={g.label} className="grid gap-2">
            <h2 className="text-sm font-medium text-muted-foreground first-letter:uppercase">{g.label}</h2>
            <Card className="py-0">
              <CardContent className="divide-y px-0">
                {g.items.map((n) => {
                  const { icon: Icon, tone } = icons[n.type] ?? fallback;
                  return (
                    <NotificationRow key={n.id} id={n.id} url={n.url} read={Boolean(n.readAt)}>
                      <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${tone}`}>
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className={n.readAt ? "text-sm" : "text-sm font-medium"}>{text(n.type, n.data as Record<string, string | number>)}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">{format.dateTime(n.createdAt, { hour: "2-digit", minute: "2-digit" })}</span>
                      </span>
                    </NotificationRow>
                  );
                })}
              </CardContent>
            </Card>
          </section>
        ))
      )}
      <Pager page={page} pages={list.pages} total={list.total} href={(p) => href({ page: p })} />
    </div>
  );
}
