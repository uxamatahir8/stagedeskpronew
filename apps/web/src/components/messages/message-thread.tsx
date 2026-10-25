import { MessagesSquareIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import { type MessageChannel, markThreadRead, threadMessages } from "@stagedesk/db";
import { cn } from "@/lib/utils";
import { Composer, LiveThread } from "./composer";

/**
 * One conversation of a booking: messages oldest first, the viewer's own on
 * the right, and a composer. Opening it marks it read.
 */
export async function MessageThread({ bookingId, code, channel, viewerId }: { bookingId: string; code: string; channel: MessageChannel; viewerId: string }) {
  const [t, format, messages] = await Promise.all([getTranslations("messages"), getFormatter(), threadMessages(bookingId, channel)]);
  await markThreadRead(viewerId, bookingId, channel);

  return (
    <div className="grid gap-4">
      <LiveThread code={code} />
      {messages.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
          <MessagesSquareIcon className="size-5" aria-hidden />
          {t(`empty_${channel}`)}
        </div>
      ) : (
        <ol className="grid max-h-[32rem] gap-3 overflow-y-auto pr-1" aria-label={t("conversation")}>
          {messages.map((m) => {
            const own = m.authorId === viewerId;
            return (
              <li key={m.id} className={cn("grid max-w-[85%] gap-1", own ? "justify-self-end text-right" : "justify-self-start")}>
                <span className="text-xs text-muted-foreground">
                  {own ? t("you") : (m.author?.name ?? t("removedUser"))} · {format.dateTime(m.createdAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
                <p className={cn("rounded-2xl px-3.5 py-2 text-left text-sm whitespace-pre-line", own ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted")}>
                  {m.body}
                </p>
              </li>
            );
          })}
        </ol>
      )}
      <Composer code={code} channel={channel} />
    </div>
  );
}
