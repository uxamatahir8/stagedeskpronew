import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { EventType } from "@stagedesk/core";
import type { MessageChannel } from "@stagedesk/db";
import { MessageThread } from "@/components/messages/message-thread";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { eventDate } from "@/lib/format";
import { messageAccess } from "@/lib/messages";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/lib/viewer";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/messages/[code]">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "messages" });
  return { title: t("title") };
}

export default function ConversationPage({ params, searchParams }: PageProps<"/[locale]/app/messages/[code]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Conversation params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Conversation({ params, searchParams }: Pick<PageProps<"/[locale]/app/messages/[code]">, "params" | "searchParams">) {
  setRequestLocale((await params).locale as Locale);
  const viewer = await requirePermission("messages");
  const { code } = await params;
  const access = await messageAccess(viewer, code);
  if (!access) notFound();
  const requested = (await searchParams)["channel"];
  const channel: MessageChannel = access.channels.includes(requested as MessageChannel) ? (requested as MessageChannel) : access.channels[0]!;
  const [t, te, format] = await Promise.all([getTranslations("messages"), getTranslations("eventTypes"), getFormatter()]);
  const { booking } = access;
  const artist = booking.assignments[0]?.artist.stageName;

  const title = access.isDesk ? (channel === "customer" ? (booking.customer?.name ?? booking.trackingCode) : (artist ?? t("withArtist"))) : booking.organization.name;
  const detail = [te(booking.eventType as EventType), eventDate(format, booking.eventDate), booking.trackingCode].filter(Boolean).join(" · ");

  return (
    <div className="grid max-w-3xl gap-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href="/app/messages">
          <ArrowLeftIcon />
          {t("allConversations")}
        </Link>
      </Button>
      <PageHeader
        title={title}
        description={detail}
        actions={
          access.isDesk ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/app/bookings/${booking.trackingCode}`}>{t("openBooking")}</Link>
            </Button>
          ) : undefined
        }
      />
      {access.channels.length > 1 && (
        <nav className="flex gap-1 rounded-lg bg-muted p-1 text-sm" aria-label={t("channels")}>
          {access.channels.map((c) => (
            <Link
              key={c}
              href={`/app/messages/${booking.trackingCode}?channel=${c}`}
              aria-current={c === channel ? "page" : undefined}
              className={cn("flex-1 rounded-md px-3 py-1.5 text-center", c === channel ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {t(`channel_${c}`)}
            </Link>
          ))}
        </nav>
      )}
      <Card>
        <CardContent>
          <MessageThread bookingId={booking.id} code={booking.trackingCode} channel={channel} viewerId={viewer.user.id} />
        </CardContent>
      </Card>
    </div>
  );
}
