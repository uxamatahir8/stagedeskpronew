"use client";

import { CheckCheckIcon, CheckIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { clearReadAction, markReadAction } from "@/lib/notification-actions";
import { cn } from "@/lib/utils";

/** One notification: clicking opens its page and marks it read; unread ones can also be marked read in place. */
export function NotificationRow({ id, url, read, children }: { id: string; url: string | null; read: boolean; children: React.ReactNode }) {
  const t = useTranslations("notificationsPage");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const markRead = () =>
    startTransition(async () => {
      await markReadAction([id]);
      router.refresh();
    });

  return (
    <div className={cn("relative flex items-center gap-3 px-4 py-3", !read && "bg-primary/[0.04]")}>
      {!read && <span className="absolute top-1/2 left-1.5 size-1.5 -translate-y-1/2 rounded-full bg-primary" aria-hidden />}
      {url ? (
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={() =>
            startTransition(async () => {
              if (!read) await markReadAction([id]);
              router.push(url);
            })
          }
        >
          {children}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
      )}
      {!read && (
        <Button variant="ghost" size="icon-sm" aria-label={t("markRead")} title={t("markRead")} disabled={pending} onClick={markRead}>
          <CheckIcon />
        </Button>
      )}
    </div>
  );
}

export function NotificationsToolbar({ unread }: { unread: number }) {
  const t = useTranslations("notificationsPage");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button
        variant="outline"
        disabled={pending || unread === 0}
        onClick={() =>
          startTransition(async () => {
            await markReadAction("all");
            toast.success(t("allRead"));
            router.refresh();
          })
        }
      >
        <CheckCheckIcon />
        {t("markAllRead")}
      </Button>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const count = await clearReadAction();
            toast.success(t("cleared", { count }));
            router.refresh();
          })
        }
      >
        <Trash2Icon />
        {t("clearRead")}
      </Button>
    </>
  );
}
