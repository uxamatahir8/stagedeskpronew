import { MessagesSquareIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { EventType } from "@stagedesk/core";
import { conversations } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { eventDate } from "@/lib/format";
import { conversationScope } from "@/lib/messages";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/lib/viewer";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/messages">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "messages" });
  return { title: t("title") };
}

export default async function MessagesPage({ params }: PageProps<"/[locale]/app/messages">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Conversations />
    </Suspense>
  );
}

async function Conversations() {
  const viewer = await requirePermission("messages");
  const scope = conversationScope(viewer);
  const [t, te, format, list] = await Promise.all([getTranslations("messages"), getTranslations("eventTypes"), getFormatter(), conversations(scope)]);
  const desk = Boolean(scope.agencyId);

  return (
    <div className="grid gap-6">
      <PageHeader title={t("title")} description={t(desk ? "descriptionDesk" : "description")} />
      {list.length === 0 ? (
        <EmptyState icon={MessagesSquareIcon} title={t("noConversations")} description={t(desk ? "noConversationsDesk" : "noConversationsHint")} />
      ) : (
        <Card>
          <CardContent className="px-0">
            <ul className="divide-y">
              {list.map((c) => {
                const title = desk ? (c.channel === "customer" ? (c.booking.customer?.name ?? c.booking.trackingCode) : t("withArtist")) : c.booking.organization.name;
                return (
                  <li key={`${c.booking.id}-${c.channel}`}>
                    <Link
                      href={`/app/messages/${c.booking.trackingCode}?channel=${c.channel}`}
                      className="grid gap-1 px-6 py-3 hover:bg-accent/40 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4"
                    >
                      <span className="grid min-w-0 gap-0.5">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className={cn("truncate", c.unread > 0 ? "font-semibold" : "font-medium")}>{title}</span>
                          {desk && <Pill tone={c.channel === "customer" ? "info" : "brand"}>{t(`channel_${c.channel}`)}</Pill>}
                          <span className="text-xs text-muted-foreground">
                            {te(c.booking.eventType as EventType)}
                            {c.booking.eventDate && ` · ${eventDate(format, c.booking.eventDate, "short")}`} · <span className="font-mono">{c.booking.trackingCode}</span>
                          </span>
                        </span>
                        <span className="truncate text-sm text-muted-foreground">
                          {c.last.authorId === viewer.user.id ? `${t("you")}: ` : c.last.author ? `${c.last.author.name.split(/\s+/)[0]}: ` : ""}
                          {c.last.body}
                        </span>
                      </span>
                      <span className="flex items-center gap-3 text-xs text-muted-foreground sm:justify-end">
                        {format.dateTime(c.last.createdAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        {c.unread > 0 && (
                          <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground tabular-nums" aria-label={t("unread", { count: c.unread })}>
                            {c.unread}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
