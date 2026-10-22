import { CalendarCheckIcon, EuroIcon, InboxIcon, PlusIcon, ReceiptIcon, TimerIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { bookingStatuses, type BookingStatus } from "@stagedesk/core";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { BookingStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Locale } from "@/i18n/routing";
import { ToastButton } from "./toast-button";

export const metadata: Metadata = { title: "Design system" };

// Sample rows for the table preview; clearly labelled as sample data on the page.
const sampleBookings: { code: string; customer: string; date: string; type: "wedding" | "corporate" | "birthday"; cents: number; status: BookingStatus }[] = [
  { code: "K7Q2M9XA", customer: "Sanne & Daan de Vries", date: "2027-06-12", type: "wedding", cents: 185_000, status: "confirmed" },
  { code: "P3D8R1LT", customer: "Rabo Utrecht", date: "2027-03-20", type: "corporate", cents: 240_000, status: "quoted" },
  { code: "B9F4H6WN", customer: "Lotte Jansen", date: "2027-02-08", type: "birthday", cents: 65_000, status: "inquiry" },
  { code: "M2X5C8QE", customer: "Femke & Bram Visser", date: "2026-09-26", type: "wedding", cents: 210_000, status: "settled" },
];

export default async function DesignSystemPage({ params }: PageProps<"/[locale]/app/ui">) {
  if (process.env.NODE_ENV === "production") notFound();
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const [t, th, format] = await Promise.all([getTranslations("ui"), getTranslations("home.stats"), getFormatter()]);
  const euro = (cents: number) => format.number(cents / 100, { style: "currency", currency: "EUR" });

  return (
    <div className="grid gap-10">
      <PageHeader title={t("title")} description={t("description")} />

      <Section title={t("buttons")}>
        <div className="flex flex-wrap gap-2">
          <Button>{t("primary")}</Button>
          <Button variant="secondary">{t("secondary")}</Button>
          <Button variant="outline">{t("outline")}</Button>
          <Button variant="ghost">{t("ghost")}</Button>
          <Button variant="destructive">{t("destructive")}</Button>
          <Button size="sm">
            <PlusIcon />
            {t("emptyAction")}
          </Button>
          <ToastButton label={t("toast")} message={t("toastDone")} />
        </div>
      </Section>

      <Section title={t("badges")}>
        <div className="flex flex-wrap gap-2">
          {bookingStatuses.map((status) => (
            <BookingStatusBadge key={status} status={status} />
          ))}
        </div>
      </Section>

      <Section title={t("stats")}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label={th("newInquiries")} value="12" hint={t("sample")} icon={InboxIcon} />
          <StatCard label={th("quotesExpiring")} value="4" hint={t("sample")} icon={TimerIcon} />
          <StatCard label={th("eventsThisWeek")} value="7" hint={t("sample")} icon={CalendarCheckIcon} />
          <StatCard label={th("collected")} value={euro(1_284_500)} hint={t("sample")} icon={EuroIcon} />
        </div>
      </Section>

      <Section title={t("forms")}>
        <Card className="max-w-xl">
          <CardContent className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="ui-email">{t("email")}</Label>
              <Input id="ui-email" type="email" placeholder="sanne@voorbeeld.nl" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ui-type">{t("eventTypeLabel")}</Label>
              <Select defaultValue="wedding">
                <SelectTrigger id="ui-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wedding">{t("wedding")}</SelectItem>
                  <SelectItem value="corporate">{t("corporate")}</SelectItem>
                  <SelectItem value="birthday">{t("birthday")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-4">
              <Label htmlFor="ui-notify">{t("notify")}</Label>
              <Switch id="ui-notify" defaultChecked />
            </div>
          </CardContent>
        </Card>
      </Section>

      <Section title={t("table")}>
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
              <CardTitle>{t("table")}</CardTitle>
              <CardDescription>
                <Badge variant="outline">{t("sample")}</Badge>
              </CardDescription>
            </div>
            <Tabs defaultValue="all">
              <TabsList>
                <TabsTrigger value="all">{t("tabsAll")}</TabsTrigger>
                <TabsTrigger value="open">{t("tabsOpen")}</TabsTrigger>
                <TabsTrigger value="done">{t("tabsDone")}</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("customer")}</TableHead>
                  <TableHead>{t("eventType")}</TableHead>
                  <TableHead>{t("eventDate")}</TableHead>
                  <TableHead className="text-right">{t("amount")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sampleBookings.map((b) => (
                  <TableRow key={b.code}>
                    <TableCell>
                      <div className="font-medium">{b.customer}</div>
                      <div className="font-mono text-xs text-muted-foreground">{b.code}</div>
                    </TableCell>
                    <TableCell>{t(b.type)}</TableCell>
                    <TableCell className="tabular-nums">
                      {format.dateTime(new Date(b.date), { day: "numeric", month: "short", year: "numeric" })}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{euro(b.cents)}</TableCell>
                    <TableCell>
                      <BookingStatusBadge status={b.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </Section>

      <Section title={t("empty")}>
        <EmptyState
          icon={ReceiptIcon}
          title={t("emptyTitle")}
          description={t("emptyBody")}
          action={
            <Button size="sm">
              <PlusIcon />
              {t("emptyAction")}
            </Button>
          }
        />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  );
}
