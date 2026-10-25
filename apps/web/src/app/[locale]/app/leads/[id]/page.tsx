import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import { leadDetail, prisma, type LeadStatus } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { eventDate } from "@/lib/format";
import { startSupportAction } from "@/lib/support-actions";
import { requirePermission } from "@/lib/viewer";
import { leadTone } from "../lead-tone";
import { LeadNotes, LeadRouting } from "./controls";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/leads/[id]">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "leads" });
  return { title: t("title") };
}

export default function LeadPage({ params }: PageProps<"/[locale]/app/leads/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
      <Lead params={params} />
    </Suspense>
  );
}

const offerTone = { pending: "warning", accepted: "success", declined: "danger", withdrawn: "neutral" } as const;

async function Lead({ params }: Pick<PageProps<"/[locale]/app/leads/[id]">, "params">) {
  const { locale, id } = await params;
  setRequestLocale(locale as Locale);
  await requirePermission("platform.agencies");
  const lead = await leadDetail(id);
  if (!lead) notFound();
  const [t, te, tb, format, agencies, booking] = await Promise.all([
    getTranslations("leads"),
    getTranslations("eventTypes"),
    getTranslations("budgetRanges"),
    getFormatter(),
    prisma.organization.findMany({ where: { suspendedAt: null }, select: { id: true, name: true, city: true }, orderBy: { name: "asc" } }),
    lead.bookingId ? prisma.booking.findUnique({ where: { id: lead.bookingId }, select: { trackingCode: true, organizationId: true } }) : null,
  ]);
  // Agencies in the event's city first: the likeliest match.
  const city = lead.venueCity?.trim().toLowerCase() ?? "";
  const ranked = [...agencies].sort((a, b) => Number((b.city ?? "").toLowerCase() === city) - Number((a.city ?? "").toLowerCase() === city));
  const open = lead.status === "new" || lead.status === "offered";

  const rows: [string, React.ReactNode][] = [
    [t("event"), te(lead.eventType as "wedding")],
    [t("date"), `${eventDate(format, lead.eventDate)}${lead.startTime ? ` · ${lead.startTime}` : ""}`],
    [t("venue"), [lead.venueName, lead.venueCity].filter(Boolean).join(", ") || "—"],
    [t("guests"), lead.guestCount ?? "—"],
    [t("budget"), lead.budgetRange ? tb(lead.budgetRange as "lt_750") : "—"],
    [t("genre"), lead.preferredGenre ?? "—"],
    ...(lead.eventType === "wedding" ? ([[t("partner"), lead.partnerName ?? "—"], [t("ceremony"), lead.ceremony ? t("yes") : t("no")]] as [string, React.ReactNode][]) : []),
  ];

  return (
    <div className="grid gap-6">
      <Link href="/app/leads" className="flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" aria-hidden />
        {t("all")}
      </Link>
      <PageHeader
        title={`${te(lead.eventType as "wedding")} · ${eventDate(format, lead.eventDate, "short")}`}
        description={`${lead.reference} · ${t("receivedOn", { date: format.dateTime(lead.createdAt, { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) })}`}
        actions={<Pill tone={leadTone[lead.status as LeadStatus]}>{t(`status_${lead.status as LeadStatus}`)}</Pill>}
      />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("details")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                {rows.map(([label, value]) => (
                  <div key={label} className="grid gap-0.5">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
              {lead.message && <p className="rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-line">{lead.message}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("customer")}</CardTitle>
              <CardDescription>{t("customerHint")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <span className="font-medium">{lead.name}</span>
              <a href={`mailto:${lead.email}`} className="underline-offset-4 hover:underline">
                {lead.email}
              </a>
              {lead.phone && <span>{lead.phone}</span>}
              <span className="text-muted-foreground">{(await getTranslations("languages"))(lead.locale === "en" ? "en" : "nl")}</span>
            </CardContent>
          </Card>
          <LeadNotes leadId={lead.id} notes={lead.adminNotes ?? ""} />
        </div>

        <div className="grid content-start gap-6">
          {lead.status === "assigned" && lead.assignedAgency && (
            <Card className="border-success/40">
              <CardHeader>
                <CardTitle>{t("assignedTo", { agency: lead.assignedAgency.name })}</CardTitle>
                <CardDescription>{booking ? t("assignedHint", { code: booking.trackingCode }) : null}</CardDescription>
              </CardHeader>
              {booking && (
                <CardContent>
                  <form action={startSupportAction.bind(null, booking.organizationId, `/app/bookings/${booking.trackingCode}`)}>
                    <Button type="submit" variant="outline">
                      {t("openBooking")}
                      <ArrowRightIcon />
                    </Button>
                  </form>
                </CardContent>
              )}
            </Card>
          )}
          {lead.status === "closed" && (
            <Card>
              <CardHeader>
                <CardTitle>{t("closedTitle")}</CardTitle>
                <CardDescription>{lead.closedReason ?? t("noReason")}</CardDescription>
              </CardHeader>
            </Card>
          )}
          {open && <LeadRouting leadId={lead.id} agencies={ranked} city={city} offered={lead.offers.map((o) => o.agency.id)} />}
          <Card>
            <CardHeader>
              <CardTitle>{t("offers")}</CardTitle>
              <CardDescription>{t("offersHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              {lead.offers.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noOffers")}</p>
              ) : (
                <ul className="divide-y text-sm">
                  {lead.offers.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                      <span>
                        <Link href={`/app/agencies/${o.agency.id}`} className="font-medium underline-offset-4 hover:underline">
                          {o.agency.name}
                        </Link>
                        {o.agency.city && <span className="text-muted-foreground"> · {o.agency.city}</span>}
                      </span>
                      <Pill tone={offerTone[o.status as keyof typeof offerTone]}>{t(`offer_${o.status as keyof typeof offerTone}`)}</Pill>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
