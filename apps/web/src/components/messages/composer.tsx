"use client";

import { SendIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import { sendMessageAction } from "@/lib/message-actions";

/** Fired by the notification bell for every new notification; threads listen to refresh. */
export const NOTIFICATION_EVENT = "stagedesk:notification";

export function Composer({ code, channel }: { code: string; channel: string }) {
  const t = useTranslations("messages");
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  function send() {
    if (!body.trim()) return;
    startTransition(async () => {
      const r = await sendMessageAction(code, channel, body);
      if (!r.ok) return void toast.error(r.message);
      setBody("");
      router.refresh();
    });
  }

  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <label htmlFor={`msg-${code}-${channel}`} className="sr-only">
        {t("write")}
      </label>
      <Textarea
        id={`msg-${code}-${channel}`}
        value={body}
        rows={3}
        maxLength={5000}
        placeholder={t("placeholder")}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          // Ctrl/Cmd+Enter sends; Enter alone adds a line.
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            send();
          }
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{t("sendHint")}</span>
        <Button type="submit" size="sm" disabled={pending || !body.trim()}>
          <SendIcon />
          {t("send")}
        </Button>
      </div>
    </form>
  );
}

/** Refreshes the page when a message notification for this booking arrives. */
export function LiveThread({ code }: { code: string }) {
  const router = useRouter();
  useEffect(() => {
    const onNotification = (event: Event) => {
      const detail = (event as CustomEvent<{ type: string; data: { code?: string } }>).detail;
      if (detail.type === "message" && detail.data.code === code) router.refresh();
    };
    window.addEventListener(NOTIFICATION_EVENT, onNotification);
    return () => window.removeEventListener(NOTIFICATION_EVENT, onNotification);
  }, [code, router]);
  return null;
}
