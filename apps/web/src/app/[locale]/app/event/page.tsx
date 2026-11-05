import { CalendarIcon, ClockIcon, ContactIcon, FileDownIcon, HashIcon, MapPinIcon, Music2Icon, PartyPopperIcon, PlusIcon, UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import { type BookingStatus, customerChangeMode, customerPreferencesOpen, type EventType, paymentStatus, playlistLink, todayInNetherlands, localePrefix } from "@stagedesk/core";
import { availableBookingTypes, fromDateOnly, prisma } from "@stagedesk/db";
import { PayPanel } from "@/components/booking/pay-panel";
import { SwitchAgencyLink } from "@/components/booking/switch-agency-link";
import { MessageThread } from "@/components/messages/message-thread";
import { QuoteTable } from "@/components/booking/quote-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Stars } from "@/components/stars";
import { BookingStatusBadge, PaymentStatusBadge, Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { changeRows } from "@/lib/change-requests";
import { euro, eventDate } from "@/lib/format";
import { payBookingAction, reportPaymentAction } from "@/lib/pay-actions";
import { requireAgency } from "@/lib/viewer";
import { ChangeDetailsDialog, EditPreferencesDialog, WithdrawChangeButton } from "./event-editors";
import { ReviewForm } from "./review-form";
import { confirmCheckoutReturn } from "@/lib/checkout-return";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/event">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "customerEvent" });
  return { title: t("title") };
}

export default async function EventPage({ params, searchParams }: PageProps<"/[locale]/app/event">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Event searchParams={searchParams} />
    </Suspense>
  );
}

const listOf = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "") : []);

async function Event({ searchParams }: Pick<PageProps<"/[locale]/app/event">, "searchParams">) {
  const { viewer, organization, db } = await requireAgency("customer.event");
  // Back from paying online: record it now rather than waiting for the webhook.
  await confirmCheckoutReturn((await searchParams)["session_id"], { organizationId: organization.id });
  const [t, format, locale, bookingTypes] = await Promise.all([getTranslations(), getFormatter(), getLocale(), availableBookingTypes(organization.id, true)]);
  const typeName = new Map(bookingTypes.map((type) => [type.key, locale === "nl" ? type.nameNl : type.nameEn]));

  // Only the signed-in customer's own bookings at this agency.
  const bookings = await db.booking.findMany({
    where: { customerId: viewer.user.id },
    orderBy: [{ eventDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    include: {
      quotes: { where: { status: { in: ["sent", "accepted"] } }, orderBy: { version: "desc" }, include: { items: { orderBy: { position: "asc" } } } },
      assignments: { where: { status: "accepted" }, include: { artist: { select: { stageName: true, photoUrl: true } } } },
      invoices: { select: { id: true, number: true } },
      review: true,
      changeRequests: { where: { status: { in: ["pending", "approved", "rejected"] } }, orderBy: { createdAt: "desc" }, take: 2 },
    },
  });
  const query = await searchParams;
  const requested = query["booking"];
  // Their bookings at other agencies (they can be a customer of several): reachable from here, never mixed in.
  const elsewhere = await prisma.booking.findMany({
    where: { customerId: viewer.user.id, organizationId: { not: organization.id, in: viewer.memberships.filter((m) => m.role === "customer").map((m) => m.id) } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { trackingCode: true, eventType: true, eventDate: true, organization: { select: { id: true, name: true } } },
  });
  const otherAgencies =
    elsewhere.length > 0 ? (
      <Card>
        <CardHeader>
          <CardTitle>{t("customerEvent.atOtherAgencies")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 text-sm">
            {elsewhere.map((b) => (
              <li key={b.trackingCode}>
                <SwitchAgencyLink organizationId={b.organization.id} href={`/app/event?booking=${b.trackingCode}`}>
                  {t(`eventTypes.${b.eventType as EventType}`)} · {eventDate(format, b.eventDate, "short") ?? t("bookings.noDate")} · {b.organization.name}
                </SwitchAgencyLink>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    ) : null;
  const requestButton = (label: string) => (
    <Button asChild>
      <Link href="/app/event/request">
        <PlusIcon />
        {label}
      </Link>
    </Button>
  );

  if (bookings.length === 0) {
    return (
      <div className="grid gap-6">
        <PageHeader title={t("customerEvent.title")} />
        <EmptyState icon={PartyPopperIcon} title={t("customerEvent.noBooking", { agency: organization.name })} description={t("customerEvent.noBookingBody")} action={requestButton(t("customerHome.requestBooking"))} />
        {otherAgencies}
      </div>
    );
  }

  const today = todayInNetherlands();
  const upcoming = bookings.find((b) => b.eventDate && b.eventDate.toISOString().slice(0, 10) >= today && !["cancelled", "declined"].includes(b.status));
  const booking = bookings.find((b) => b.trackingCode === requested) ?? upcoming ?? bookings[0]!;
  const status = booking.status as BookingStatus;
  const quote = booking.quotes.find((q) => q.status === "accepted") ?? booking.quotes[0] ?? null;
  const artist = booking.assignments[0]?.artist ?? null;
  const daysToGo = booking.eventDate
    ? Math.round((booking.eventDate.getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000)
    : null;
  const langPrefix = localePrefix(locale);
  const date = fromDateOnly(booking.eventDate);

  const agency = await prisma.organization.findUniqueOrThrow({ where: { id: organization.id }, select: { customerPreferencesEditable: true } });
  const preferencesOpen = customerPreferencesOpen(status, date, today);
  const canEditPreferences = preferencesOpen && agency.customerPreferencesEditable;
  const changeMode = customerChangeMode(status, date, today);
  const pendingChange = booking.changeRequests.find((r) => r.status === "pending") ?? null;
  const lastDecision = pendingChange ? null : (booking.changeRequests.find((r) => r.status === "approved" || r.status === "rejected") ?? null);
  const pendingRows = pendingChange ? await changeRows(pendingChange.changes, pendingChange.baseline, format) : [];

  const dos = listOf(booking.dos);
  const donts = listOf(booking.donts);
  const playlist = playlistLink(booking.playlistUrl);
  const showPlaylist = booking.playlistUrl && /^https?:\/\//i.test(booking.playlistUrl);
  const noPreferences = !booking.preferredGenre && dos.length === 0 && donts.length === 0 && !booking.playlistUrl && !booking.musicRequests && !booking.specialRequests;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={typeName.get(booking.eventType) ?? booking.eventType}
        description={t(`customerEvent.status_${status}`, { agency: organization.name })}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <BookingStatusBadge status={status} />
            {requestButton(t("customerHome.requestAnother"))}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid content-start gap-6">
          {status === "quoted" && quote?.status === "sent" && (
            <Card className="border-primary/40 bg-accent/40">
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium">{t("customerEvent.status_quoted")}</p>
                <Button asChild>
                  <a href={`${langPrefix}/q/${quote.token}`}>{t("customerEvent.viewQuote")}</a>
                </Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t("customerEvent.details")}</CardTitle>
              {changeMode !== "closed" && !pendingChange && (
                <CardAction>
                  <ChangeDetailsDialog
                    bookingId={booking.id}
                    direct={changeMode === "direct"}
                    today={today}
                    values={{
                      eventType: booking.eventType as EventType,
                      eventDate: date ?? "",
                      startTime: booking.startTime ?? "",
                      endTime: booking.endTime ?? "",
                      venueName: booking.venueName ?? "",
                      venueAddress: booking.venueAddress ?? "",
                      venueCity: booking.venueCity ?? "",
                      guestCount: booking.guestCount?.toString() ?? "",
                    }}
                    bookingTypes={bookingTypes.filter((type) => type.active || type.key === booking.eventType).map((type) => ({ key: type.key, label: typeName.get(type.key) ?? type.key }))}
                  />
                </CardAction>
              )}
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Item icon={HashIcon} label={t("customerEvent.reference")}><span className="font-mono">{booking.trackingCode}</span></Item>
                <Item icon={ContactIcon} label={t("customerEvent.agency")}>{organization.name}</Item>
                <Item icon={PartyPopperIcon} label={t("newBooking.eventType")}>{typeName.get(booking.eventType) ?? booking.eventType}</Item>
                <Item icon={CalendarIcon} label={t("newBooking.eventDate")}>{eventDate(format, booking.eventDate) ?? t("bookings.noDate")}</Item>
                <Item icon={ClockIcon} label={t("newBooking.startTime")}>{booking.startTime ? `${booking.startTime}${booking.endTime ? ` – ${booking.endTime}` : ""}` : "—"}</Item>
                <Item icon={MapPinIcon} label={t("newBooking.venue")}>{[booking.venueName, booking.venueAddress, booking.venueCity].filter(Boolean).join(", ") || "—"}</Item>
                <Item icon={UsersIcon} label={t("newBooking.guestCount")}>{booking.guestCount ? t("booking.guests", { count: booking.guestCount }) : "—"}</Item>
                {booking.partnerName && <Item label={t("newBooking.partnerName")}>{booking.partnerName}</Item>}
              </dl>
              {daysToGo !== null && daysToGo >= 0 && openOrBooked(status) && <p className="text-2xl font-semibold tracking-tight">{t("customerEvent.daysToGo", { count: daysToGo })}</p>}
              {pendingChange && (
                <div className="grid gap-2 rounded-lg border border-info/30 bg-info/5 p-3" data-testid="pending-change">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{t("customerEvent.changePending")}</p>
                    <WithdrawChangeButton requestId={pendingChange.id} />
                  </div>
                  <ul className="grid gap-1">
                    {pendingRows.map((r) => (
                      <li key={r.field}>
                        {r.label}: <span className="text-muted-foreground line-through">{r.from}</span> → <span className="font-medium">{r.to}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {lastDecision && (
                <p className="rounded-lg bg-muted/60 p-3" data-testid="last-change-decision">
                  {t(lastDecision.status === "approved" ? "customerEvent.changeApproved" : "customerEvent.changeRejected")}
                  {lastDecision.decisionNote && ` ${lastDecision.decisionNote}`}
                </p>
              )}
              {changeMode !== "direct" && !pendingChange && changeMode !== "closed" && <p className="text-xs text-muted-foreground">{t("customerEvent.changeRequestHint")}</p>}
            </CardContent>
          </Card>

          <Card id="preferences">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Music2Icon className="size-4" aria-hidden />
                {t("customerEvent.preferences")}
              </CardTitle>
              <CardDescription>{canEditPreferences ? t("customerEvent.preferencesHint") : !preferencesOpen ? t("customerEvent.preferencesClosed") : t("customerEvent.preferencesLocked", { agency: organization.name })}</CardDescription>
              {canEditPreferences && (
                <CardAction>
                  <EditPreferencesDialog
                    bookingId={booking.id}
                    values={{
                      preferredGenre: booking.preferredGenre ?? "",
                      dos: dos.join("\n"),
                      donts: donts.join("\n"),
                      playlistUrl: booking.playlistUrl ?? "",
                      musicRequests: booking.musicRequests ?? "",
                      specialRequests: booking.specialRequests ?? "",
                    }}
                  />
                </CardAction>
              )}
            </CardHeader>
            <CardContent className="grid gap-4 text-sm" data-testid="event-preferences">
              {noPreferences && <p className="text-muted-foreground">{t("customerEvent.noPreferences")}</p>}
              {booking.preferredGenre && <Item label={t("bookingPage.genre")}>{booking.preferredGenre}</Item>}
              {(dos.length > 0 || donts.length > 0) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {dos.length > 0 && <BulletList title={t("customerEvent.dosLabel")} items={dos} />}
                  {donts.length > 0 && <BulletList title={t("customerEvent.dontsLabel")} items={donts} />}
                </div>
              )}
              {showPlaylist && (
                <a href={booking.playlistUrl!} target="_blank" rel="noopener noreferrer" className="w-fit text-primary underline-offset-4 hover:underline">
                  {playlist ? t(`customerEvent.provider_${playlist.provider}`) : t("booking.playlist")}
                </a>
              )}
              {booking.musicRequests && <Item label={t("customerEvent.musicRequests")}><span className="whitespace-pre-line">{booking.musicRequests}</span></Item>}
              {booking.specialRequests && <Item label={t("customerEvent.specialRequests")}><span className="whitespace-pre-line">{booking.specialRequests}</span></Item>}
              {booking.message && <Item label={t("customerEvent.yourMessage")}><span className="whitespace-pre-line">{booking.message}</span></Item>}
            </CardContent>
          </Card>

          {quote && (
            <Card>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {t("customerEvent.quote")}
                  {quote.status === "accepted" && <Pill tone="success">{t("quoteStatus.accepted")}</Pill>}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <QuoteTable quote={quote} currency={booking.currency} />
              </CardContent>
            </Card>
          )}

          {(status === "completed" || status === "settled") && (
            <Card>
              <CardHeader>
                <CardTitle>{t("customerEvent.review")}</CardTitle>
              </CardHeader>
              <CardContent>
                {booking.review ? (
                  <div className="grid gap-2 text-sm">
                    <Stars rating={booking.review.rating} />
                    {booking.review.comment && <p className="whitespace-pre-line">{booking.review.comment}</p>}
                    <p className="text-muted-foreground">{t("customerEvent.reviewThanks")}</p>
                  </div>
                ) : (
                  <ReviewForm bookingId={booking.id} />
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t("messages.withAgency", { agency: organization.name })}</CardTitle>
            </CardHeader>
            <CardContent>
              <MessageThread bookingId={booking.id} code={booking.trackingCode} channel="customer" viewerId={viewer.user.id} />
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("customerEvent.yourArtist")}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-3 text-sm">
              {artist ? (
                <>
                  {artist.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- served from /files
                    <img src={artist.photoUrl} alt="" className="size-12 rounded-xl object-cover" />
                  ) : null}
                  <span className="font-medium">{artist.stageName}</span>
                </>
              ) : (
                <span className="text-muted-foreground">{t("customerHome.noArtistYet")}</span>
              )}
            </CardContent>
          </Card>

          {booking.totalCents > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {t("customerEvent.payments")}
                  <PaymentStatusBadge status={paymentStatus(booking.paidCents, booking.totalCents, booking.depositCents)} />
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <p>{t("customerEvent.paidOf", { paid: euro(format, booking.paidCents, booking.currency), total: euro(format, booking.totalCents, booking.currency) })}</p>
                <PayPanel
                  booking={booking}
                  pay={payBookingAction.bind(null, booking.id, "event")}
                  report={reportPaymentAction.bind(null, booking.id)}
                  paid={query["paid"]}
                  allowRequestDetails
                />
                {booking.invoices.map((inv) => (
                  <Button key={inv.id} variant="outline" size="sm" asChild className="w-fit">
                    <a href={`/api/pdf/invoice/${inv.id}?lang=${locale}`} target="_blank" rel="noopener">
                      <FileDownIcon />
                      {t("customerEvent.invoice", { number: inv.number })}
                    </a>
                  </Button>
                ))}
              </CardContent>
            </Card>
          )}

          {bookings.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("customerEvent.otherBookings")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2 text-sm">
                  {bookings
                    .filter((b) => b.id !== booking.id)
                    .map((b) => (
                      <li key={b.id}>
                        <Link href={`/app/event?booking=${b.trackingCode}`} className="hover:underline">
                          {t(`eventTypes.${b.eventType as EventType}`)} · {eventDate(format, b.eventDate, "short") ?? t("bookings.noDate")}
                        </Link>
                      </li>
                    ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {otherAgencies}
        </div>
      </div>
    </div>
  );
}

function openOrBooked(status: BookingStatus) {
  return ["inquiry", "quoted", "booked", "confirmed"].includes(status);
}

function Item({ icon: Icon, label, children }: { icon?: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="flex items-center gap-1.5 text-muted-foreground">
        {Icon && <Icon className="size-3.5" />}
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function BulletList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="mb-1 font-medium">{title}</p>
      <ul className="list-disc pl-4 text-muted-foreground">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}
