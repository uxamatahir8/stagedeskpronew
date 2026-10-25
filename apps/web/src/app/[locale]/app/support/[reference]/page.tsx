import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import { prisma } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/lib/viewer";
import { TicketReply } from "../support-forms";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/support/[reference]">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "support" });
  return { title: t("title") };
}

export default function TicketPage({ params }: PageProps<"/[locale]/app/support/[reference]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Ticket params={params} />
    </Suspense>
  );
}

const statusTone = { open: "warning", answered: "info", closed: "neutral" } as const;

async function Ticket({ params }: Pick<PageProps<"/[locale]/app/support/[reference]">, "params">) {
  setRequestLocale((await params).locale as Locale);
  const viewer = await requirePermission("support");
  const staff = viewer.permissions.includes("platform.support");
  const { reference } = await params;
  const ticket = await prisma.supportTicket.findUnique({
    where: { reference },
    include: { user: { select: { name: true, email: true } }, messages: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } } },
  });
  // Someone else's ticket looks the same as a missing one.
  if (!ticket || (!staff && ticket.userId !== viewer.user.id)) notFound();
  const [t, format, agency] = await Promise.all([
    getTranslations("support"),
    getFormatter(),
    ticket.agencyId ? prisma.organization.findUnique({ where: { id: ticket.agencyId }, select: { name: true } }) : null,
  ]);

  return (
    <div className="grid max-w-3xl gap-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href="/app/support">
          <ArrowLeftIcon />
          {t("back")}
        </Link>
      </Button>
      <PageHeader
        title={ticket.subject}
        description={[ticket.reference, t(`category_${ticket.category as "other"}`), staff ? `${ticket.user.name} · ${agency?.name ?? ticket.user.email}` : null].filter(Boolean).join(" · ")}
        actions={<Pill tone={statusTone[ticket.status as keyof typeof statusTone] ?? "neutral"}>{t(staff ? `status_${ticket.status as "open"}` : `userStatus_${ticket.status as "open"}`)}</Pill>}
      />
      <Card>
        <CardContent className="grid gap-6">
          <ol className="grid gap-4">
            {ticket.messages.map((m) => (
              <li key={m.id} className={cn("grid gap-1 rounded-lg border p-4", m.fromStaff && "border-primary/30 bg-primary/5")}>
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{m.fromStaff ? t("supportTeam") : (m.author?.name ?? t("removedUser"))}</span>
                  {m.fromStaff && staff && m.author && <span>({m.author.name})</span>}
                  <span>· {format.dateTime(m.createdAt, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </span>
                <p className="text-sm whitespace-pre-line">{m.body}</p>
              </li>
            ))}
          </ol>
          <TicketReply reference={ticket.reference} closed={ticket.status === "closed"} />
        </CardContent>
      </Card>
    </div>
  );
}
