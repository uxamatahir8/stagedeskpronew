"use client";

import { BellIcon, CheckCheckIcon } from "lucide-react";
import { useNow, useTranslations } from "next-intl";
import { useFormatter } from "@/components/date-prefs";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { NOTIFICATION_EVENT } from "@/components/messages/composer";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Link, useRouter } from "@/i18n/navigation";
import { markReadAction } from "@/lib/notification-actions";
import { cn } from "@/lib/utils";

interface Item {
  id: string;
  type: string;
  data: Record<string, string | number>;
  url: string | null;
  readAt: string | null;
  createdAt: string;
}

/** The bell in the top bar, kept live over server-sent events. New notifications also pop up as a toast. */
export function NotificationBell() {
  const t = useTranslations("notifications");
  const ts = useTranslations("shell");
  const format = useFormatter();
  // Keeps "5 minutes ago" current while the menu is open.
  const now = useNow({ updateInterval: 60_000 });
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const seen = useRef<Set<string> | null>(null);

  // Amounts are stored in cents; the messages format euros.
  const values = (data: Item["data"]) => ("cents" in data ? { ...data, amount: Number(data["cents"]) / 100 } : data);
  const text = (n: Item) => (t.has(n.type as "message") ? t(n.type as "message", values(n.data) as never) : n.type);

  useEffect(() => {
    const source = new EventSource("/api/notifications/stream");
    source.onmessage = (event) => {
      const snapshot = JSON.parse(event.data) as { items: Item[]; unread: number };
      // Toast only what arrived after the first snapshot.
      if (seen.current) {
        for (const n of snapshot.items) {
          if (seen.current.has(n.id) || n.readAt) continue;
          toast(text(n));
          window.dispatchEvent(new CustomEvent(NOTIFICATION_EVENT, { detail: n }));
        }
      }
      seen.current = new Set(snapshot.items.map((n) => n.id));
      setItems(snapshot.items);
      setUnread(snapshot.unread);
    };
    return () => source.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one stream per mount
  }, []);

  function open(n: Item) {
    if (!n.readAt) {
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
      void markReadAction([n.id]);
    }
    if (n.url) router.push(n.url);
  }

  function readAll() {
    setItems((list) => list.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
    setUnread(0);
    void markReadAction("all");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative" aria-label={unread ? ts("notificationsUnread", { count: unread }) : ts("notifications")}>
          <BellIcon />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground tabular-nums">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between gap-2 pr-1">
          <DropdownMenuLabel>{ts("notifications")}</DropdownMenuLabel>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7" onClick={readAll}>
              <CheckCheckIcon />
              {t("readAll")}
            </Button>
          )}
        </div>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">{ts("noNotifications")}</p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {items.map((n) => (
              <DropdownMenuItem key={n.id} onSelect={() => open(n)} className="items-start gap-2 py-2">
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} aria-hidden />
                <span className="grid gap-0.5">
                  <span className={cn("text-sm", !n.readAt && "font-medium")}>{text(n)}</span>
                  <span className="text-xs text-muted-foreground">{format.relativeTime(new Date(n.createdAt), now)}</span>
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="justify-center text-sm font-medium text-primary">
          <Link href="/app/notifications">{t("viewAll")}</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
