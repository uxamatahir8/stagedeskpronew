import { BanknoteIcon, AlertTriangleIcon, CalendarCheckIcon, EuroIcon, InboxIcon, Music2Icon, TimerIcon, WalletIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import { type Permission, todayInNetherlands } from "@stagedesk/core";
import { getSetting, type TenantDb, toDateOnly } from "@stagedesk/db";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { dateTime, euro, eventDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

interface AttentionItem {
  key: string;
  href: string;
  text: string;
  detail?: string;
  tone: "info" | "warning" | "danger";
  icon: React.ComponentType<{ className?: string }>;
}

/** The agency's home: four headline figures and the queue of bookings that need someone to act. */
export async function AgencyHome({ db, permissions, currency }: { db: TenantDb; permissions: readonly Permission[]; currency: string }) {
  const [t, ta, format, defaults] = await Promise.all([
    getTranslations("home"),
    getTranslations("attention"),
    getFormatter(),
    getSetting("bookings.defaults"),
  ]);
  const now = new Date();
  const today = todayInNetherlands(now);
  const weekEnd = addDays(today, 6);
  const soon = new Date(now.getTime() + 3 * 86_400_000);
  // Offline payments are stored at midday UTC on the day received, so a UTC month boundary is exact.
  const monthStart = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  const showMoney = permissions.includes("agency.payments");
  const customer = { customer: { select: { name: true } } };

  const [newInquiries, quotesExpiring, eventsThisWeek, collected, inquiries, expiring, booked, balanceDue, claims] = await Promise.all([
    db.booking.count({ where: { status: "inquiry" } }),
    db.booking.count({ where: { status: "quoted", quoteExpiresAt: { lte: addDays(today, 7) } } }),
    db.booking.count({ where: { status: { in: ["booked", "confirmed"] }, eventDate: { gte: toDateOnly(today), lte: weekEnd } } }),
    showMoney ? db.payment.aggregate({ where: { receivedAt: { gte: monthStart } }, _sum: { amountCents: true } }) : null,
    db.booking.findMany({ where: { status: "inquiry" }, orderBy: { createdAt: "desc" }, take: 8, include: customer }),
    db.booking.findMany({ where: { status: "quoted", quoteExpiresAt: { lte: soon } }, orderBy: { quoteExpiresAt: "asc" }, take: 5, include: customer }),
    db.booking.findMany({
      where: { status: "booked" },
      orderBy: { eventDate: "asc" },
      take: 8,
      include: { ...customer, assignments: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } } },
    }),
    showMoney
      ? db.booking.findMany({
          where: {
            status: { in: ["booked", "confirmed"] },
            eventDate: { lte: addDays(today, defaults.balanceDueDaysBeforeEvent) },
          },
          orderBy: { eventDate: "asc" },
          take: 8,
          include: customer,
        })
      : [],
    // Payments customers reported (bank transfer, cash) that wait for someone to confirm receipt.
    showMoney ? db.paymentClaim.findMany({ where: { status: "pending" }, orderBy: { createdAt: "asc" }, take: 8, include: { booking: { select: { trackingCode: true, ...customer } } } }) : [],
  ]);

  const name = (b: { customer: { name: string } | null; trackingCode: string }) => b.customer?.name ?? b.trackingCode;
  const items: AttentionItem[] = [
    ...claims.map((c) => ({
      key: `c-${c.id}`,
      href: `/app/bookings/${c.booking.trackingCode}`,
      text: ta("paymentReported", { name: name(c.booking), amount: euro(format, c.amountCents, currency) }),
      detail: ta("confirmReceipt"),
      tone: "info" as const,
      icon: BanknoteIcon,
    })),
    ...inquiries.map((b) => ({
      key: `i-${b.id}`,
      href: `/app/bookings/${b.trackingCode}`,
      text: ta("newInquiry", { name: name(b) }),
      detail: [eventDate(format, b.eventDate, "short"), b.source !== "manual" ? ta(`via_${b.source as "booking_page"}`) : null].filter(Boolean).join(" · "),
      tone: "info" as const,
      icon: InboxIcon,
    })),
    ...expiring.map((b) => ({
      key: `q-${b.id}`,
      href: `/app/bookings/${b.trackingCode}`,
      text: ta("quoteExpiring", { name: name(b), date: b.quoteExpiresAt ? dateTime(format, b.quoteExpiresAt) : "" }),
      tone: "warning" as const,
      icon: TimerIcon,
    })),
    ...booked
      .filter((b) => !b.assignments[0] || b.assignments[0].status === "declined" || b.assignments[0].status === "withdrawn")
      .map((b) => ({
        key: `a-${b.id}`,
        href: `/app/bookings/${b.trackingCode}`,
        text: b.assignments[0]?.status === "declined" ? ta("artistDeclined", { name: name(b) }) : ta("noArtist", { name: name(b) }),
        detail: eventDate(format, b.eventDate, "short") ?? undefined,
        tone: b.assignments[0]?.status === "declined" ? ("danger" as const) : ("warning" as const),
        icon: Music2Icon,
      })),
    ...balanceDue
      .filter((b) => b.paidCents < b.totalCents)
      .map((b) => ({
        key: `p-${b.id}`,
        href: `/app/bookings/${b.trackingCode}`,
        text: ta("balanceDue", { name: name(b), amount: euro(format, b.totalCents - b.paidCents, currency) }),
        detail: eventDate(format, b.eventDate, "short") ?? undefined,
        tone: "warning" as const,
        icon: WalletIcon,
      })),
  ];

  const toneClass = { info: "bg-info/12 text-info", warning: "bg-warning/18 text-foreground", danger: "bg-destructive/12 text-destructive" };

  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} label={t("stats.newInquiries")} value={newInquiries} icon={InboxIcon} />
        <StatCard index={1} label={t("stats.quotesExpiring")} value={quotesExpiring} icon={TimerIcon} />
        <StatCard index={2} label={t("stats.eventsThisWeek")} value={eventsThisWeek} icon={CalendarCheckIcon} />
        <StatCard index={3} label={t("stats.collected")} value={collected ? euro(format, collected._sum.amountCents ?? 0, currency) : "—"} icon={EuroIcon} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t("attentionTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <EmptyState icon={AlertTriangleIcon} title={t("attentionEmpty")} />
          ) : (
            <ul className="divide-y">
              {items.map((item) => (
                <li key={item.key}>
                  <Link href={item.href} className="flex items-center gap-3 py-3 hover:bg-accent/40">
                    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", toneClass[item.tone])}>
                      <item.icon className="size-4" />
                    </span>
                    <span className="grid min-w-0">
                      <span className="truncate font-medium">{item.text}</span>
                      {item.detail && <span className="truncate text-sm text-muted-foreground">{item.detail}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
