import { ArrowLeftIcon, CalendarIcon, ClockIcon, FileDownIcon, MapPinIcon, MessagesSquareIcon, UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getFormatter, getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import {
  availableActions,
  type BookingStatus,
  can,
  type EventType,
  isBudgetRange,
  paymentStatus,
  todayInNetherlands,
} from "@stagedesk/core";
import { bookableArtists, fromDateOnly, getSetting, isArtistFree, prisma } from "@stagedesk/db";
import { QuoteTable } from "@/components/booking/quote-table";
import { AssignmentStatusBadge, BookingStatusBadge, PaymentStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { RefundDialog } from "../../payments/refund-dialog";
import { centsToInput, dateTime, euro, eventDate } from "@/lib/format";
import { requireAgency } from "@/lib/viewer";
import {
  AddNote,
  AssignArtist,
  EditDetailsDialog,
  IssueInvoiceButton,
  QuoteControls,
  RecordPayment,
  StatusActions,
} from "./booking-panels";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/bookings/[code]">): Promise<Metadata> {
  return { title: (await params).code };
}

export default function BookingPage({ params }: PageProps<"/[locale]/app/bookings/[code]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
      <Booking params={params} />
    </Suspense>
  );
}

const listOf = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

async function Booking({ params }: Pick<PageProps<"/[locale]/app/bookings/[code]">, "params">) {
  const { code, locale } = await params;
  setRequestLocale(locale as Locale);
  const { viewer, organization, db } = await requireAgency("agency.bookings");

  const booking = await db.booking.findFirst({
    where: { trackingCode: code.toUpperCase() },
    include: {
      customer: { select: { name: true, email: true, phone: true } },
      assignments: { orderBy: { createdAt: "desc" }, include: { artist: { include: { organization: { select: { id: true, name: true } } } } } },
      quotes: { orderBy: { version: "desc" }, include: { items: { orderBy: { position: "asc" } } } },
      payments: { orderBy: { receivedAt: "asc" } },
      notes: { orderBy: { createdAt: "desc" } },
      events: { orderBy: { createdAt: "desc" }, take: 50 },
      invoices: true,
    },
  });
  if (!booking) notFound();

  const [t, format, catalog, defaults, people] = await Promise.all([
    getTranslations(),
    getFormatter(),
    db.serviceItem.findMany({ where: { active: true }, orderBy: [{ position: "asc" }, { name: "asc" }] }),
    getSetting("bookings.defaults"),
    prisma.user.findMany({
      where: { id: { in: [...new Set([...booking.notes.map((n) => n.authorId), ...booking.events.flatMap((e) => (e.actorId ? [e.actorId] : []))])] } },
      select: { id: true, name: true },
    }),
  ]);
  const nameOf = (id: string | null) => people.find((p) => p.id === id)?.name ?? null;
  // The requested artist can belong to a partner agency, so this isn't tenant-scoped.
  const preferredArtist = booking.preferredArtistId
    ? await prisma.artist.findUnique({ where: { id: booking.preferredArtistId }, select: { stageName: true } })
    : null;

  const now = new Date();
  const today = todayInNetherlands(now);
  const status = booking.status as BookingStatus;
  const ctx = {
    today,
    eventDate: fromDateOnly(booking.eventDate),
    now,
    quoteExpiresAt: booking.quoteExpiresAt,
    paidCents: booking.paidCents,
    totalCents: booking.totalCents,
  };
  const actions = availableActions(status, "agency", ctx).filter(
    (a): a is "decline" | "cancel" | "complete" | "settle" => ["decline", "cancel", "complete", "settle"].includes(a),
  );
  const canQuote = availableActions(status, "agency", ctx).includes("send_quote") && can(viewer.role, "agency.quotes");
  const canPay = can(viewer.role, "agency.payments");

  const current = booking.quotes[0] ?? null;
  const openQuote = current?.status === "sent" ? current : null;
  const acceptedQuote = booking.quotes.find((q) => q.status === "accepted") ?? null;
  const shownQuote = acceptedQuote ?? current;
  const activeAssignment = booking.assignments.find((a) => a.status === "pending" || a.status === "accepted") ?? null;
  const lastDeclined = !activeAssignment ? booking.assignments.find((a) => a.status === "declined") : null;
  const invoice = booking.invoices[0] ?? null;
  const pay = paymentStatus(booking.paidCents, booking.totalCents, booking.depositCents);

  const canAssign = status === "booked" || status === "confirmed";
  const artistOptions = canAssign
    ? await Promise.all(
        (await bookableArtists(organization.id)).map(async (a) => ({
          id: a.id,
          stageName: a.stageName,
          agency: a.organizationId === organization.id ? null : a.organization.name,
          free: booking.eventDate ? await isArtistFree(a.id, booking.eventDate, booking.id) : true,
        })),
      )
    : [];

  const timelineText = (e: (typeof booking.events)[number]) => {
    const data = (e.data ?? {}) as Record<string, unknown>;
    // Event types come from the database; unknown ones fall back to their raw name.
    const key = `timeline.${e.type}` as "timeline.created";
    const params = {
      version: String(data["version"] ?? ""),
      name: String(data["name"] ?? ""),
      stageName: String(data["stageName"] ?? ""),
      reason: String(data["reason"] ?? ""),
      number: String(data["number"] ?? ""),
      amount: typeof data["amountCents"] === "number" ? euro(format, data["amountCents"]) : "",
    };
    return t.has(key) ? t(key, params) : e.type;
  };

  const values = {
    eventType: booking.eventType as EventType,
    eventDate: fromDateOnly(booking.eventDate) ?? "",
    startTime: booking.startTime ?? "",
    endTime: booking.endTime ?? "",
    venueName: booking.venueName ?? "",
    venueAddress: booking.venueAddress ?? "",
    venueCity: booking.venueCity ?? "",
    guestCount: booking.guestCount?.toString() ?? "",
    budget: booking.budgetCents ? centsToInput(booking.budgetCents, await getLocale()) : "",
    partnerName: booking.partnerName ?? "",
  };
  const dos = listOf(booking.dos);
  const donts = listOf(booking.donts);
  const editable = ["inquiry", "quoted", "booked", "confirmed", "expired"].includes(status);

  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <Link href="/app/bookings" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" />
          {t("booking.back")}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                {t(`eventTypes.${booking.eventType as EventType}`)} · {booking.customer?.name ?? t("bookings.noCustomer")}
              </h1>
              <BookingStatusBadge status={status} />
            </div>
            <p className="font-mono text-sm text-muted-foreground">{booking.trackingCode}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusActions bookingId={booking.id} actions={actions} />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("booking.eventDetails")}</CardTitle>
              {editable && (
                <CardAction>
                  <EditDetailsDialog
                    bookingId={booking.id}
                    values={values}
                    dos={dos}
                    donts={donts}
                    playlistUrl={booking.playlistUrl ?? ""}
                  />
                </CardAction>
              )}
            </CardHeader>
            <CardContent className="grid gap-4">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <Detail icon={CalendarIcon} label={t("newBooking.eventDate")}>
                  {eventDate(format, booking.eventDate) ?? t("bookings.noDate")}
                </Detail>
                <Detail icon={ClockIcon} label={t("newBooking.startTime")}>
                  {booking.startTime ? `${booking.startTime}${booking.endTime ? ` – ${booking.endTime}` : ""}` : "—"}
                </Detail>
                <Detail icon={MapPinIcon} label={t("newBooking.venue")}>
                  {[booking.venueName, booking.venueAddress, booking.venueCity].filter(Boolean).join(", ") || "—"}
                </Detail>
                <Detail icon={UsersIcon} label={t("newBooking.guestCount")}>
                  {booking.guestCount ? t("booking.guests", { count: booking.guestCount }) : "—"}
                </Detail>
                {booking.partnerName && <Detail label={t("newBooking.partnerName")}>{booking.partnerName}</Detail>}
                {booking.budgetCents && <Detail label={t("newBooking.budget")}>{euro(format, booking.budgetCents)}</Detail>}
                {booking.budgetRange && isBudgetRange(booking.budgetRange) && (
                  <Detail label={t("bookingPage.budget")}>{t(`budgetRanges.${booking.budgetRange}`)}</Detail>
                )}
                {preferredArtist && <Detail label={t("bookingPage.artist")}>{preferredArtist.stageName}</Detail>}
                {booking.preferredGenre && <Detail label={t("bookingPage.genre")}>{booking.preferredGenre}</Detail>}
                {booking.ceremony && <Detail label={t("eventTypes.wedding")}>{t("bookingPage.ceremony")}</Detail>}
                {booking.source === "booking_page" && <Detail label={t("bookings.event")}>{t("attention.viaPage")}</Detail>}
              </dl>
              {booking.message && (
                <div className="rounded-lg bg-muted/60 p-3 text-sm">
                  <p className="mb-1 font-medium">{t("booking.customerMessage")}</p>
                  <p className="whitespace-pre-line text-muted-foreground">{booking.message}</p>
                </div>
              )}
              {(dos.length > 0 || donts.length > 0 || booking.playlistUrl) && (
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  {dos.length > 0 && <BulletList title={t("booking.dos")} items={dos} />}
                  {donts.length > 0 && <BulletList title={t("booking.donts")} items={donts} />}
                  {booking.playlistUrl && (
                    <a href={booking.playlistUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
                      {t("booking.playlist")}
                    </a>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("booking.quote")}</CardTitle>
              {shownQuote && (
                <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span>{t("booking.version", { n: shownQuote.version })}</span>
                  <span>· {t(`quoteStatus.${shownQuote.status as "sent"}`)}</span>
                  {shownQuote.status === "sent" && <span>· {t("booking.expires", { date: dateTime(format, shownQuote.expiresAt) })}</span>}
                  {shownQuote.acceptedAt && (
                    <span>· {t("booking.acceptedBy", { name: shownQuote.acceptedByName ?? "", date: dateTime(format, shownQuote.acceptedAt) })}</span>
                  )}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="grid gap-4">
              {shownQuote ? (
                <QuoteTable quote={shownQuote} />
              ) : (
                <p className="text-sm text-muted-foreground">{t("booking.noQuote")}</p>
              )}
              <QuoteControls
                bookingId={booking.id}
                canQuote={canQuote}
                hasQuote={Boolean(current)}
                quoteId={openQuote?.id ?? null}
                quoteLink={openQuote ? `${locale === "en" ? "/en" : ""}/q/${openQuote.token}` : null}
                pdfHref={shownQuote ? `/api/pdf/quote/${shownQuote.id}?lang=${locale}` : null}
                canAcceptOnBehalf={Boolean(openQuote) && can(viewer.role, "agency.quotes")}
                customerName={booking.customer?.name ?? ""}
                catalog={catalog.map((c) => ({ id: c.id, name: c.name, unit: c.unit, unitPriceCents: c.unitPriceCents, vatBps: c.vatBps }))}
                vatRates={defaults.vatRatesBps}
                initialLines={(current?.items ?? []).map((i) => ({
                  description: i.description,
                  quantity: String(i.quantityHundredths / 100).replace(".", locale === "en" ? "." : ","),
                  unitPrice: centsToInput(i.unitPriceCents, locale),
                  vatBps: i.vatBps,
                }))}
                defaultDepositBps={current?.depositBps ?? defaults.depositBps}
                defaultExpiryDays={defaults.quoteExpiryDays}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {t("booking.payments")}
                {booking.totalCents > 0 && <PaymentStatusBadge status={pay} />}
              </CardTitle>
              {canPay && booking.totalCents > 0 && (
                <CardAction className="flex flex-wrap gap-2">
                  {invoice ? (
                    <Button variant="outline" size="sm" asChild>
                      <a href={`/api/pdf/invoice/${invoice.id}?lang=${locale}`} target="_blank" rel="noopener">
                        <FileDownIcon />
                        {t("booking.downloadInvoice", { number: invoice.number })}
                      </a>
                    </Button>
                  ) : (
                    ["booked", "confirmed", "completed", "settled"].includes(status) && <IssueInvoiceButton bookingId={booking.id} />
                  )}
                  {status !== "settled" && status !== "cancelled" && (
                    <RecordPayment bookingId={booking.id} today={today} suggestedKind={booking.paidCents < booking.depositCents ? "deposit" : "balance"} />
                  )}
                </CardAction>
              )}
            </CardHeader>
            <CardContent className="grid gap-4">
              {booking.totalCents > 0 && (
                <dl className="grid grid-cols-3 gap-3 text-sm">
                  <Figure label={t("booking.total")} value={euro(format, booking.totalCents)} />
                  <Figure label={t("booking.paid")} value={euro(format, booking.paidCents)} />
                  <Figure label={t("booking.due")} value={euro(format, Math.max(0, booking.totalCents - booking.paidCents))} />
                </dl>
              )}
              {booking.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("booking.noPayments")}</p>
              ) : (
                <ul className="divide-y text-sm">
                  {booking.payments.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        {t(`paymentKinds.${p.kind as "deposit"}`)} · {t(`paymentMethods.${p.method as "cash"}`)}
                        {p.reference && <span className="text-muted-foreground"> · {p.reference}</span>}
                      </span>
                      <span className="flex items-center gap-3 tabular-nums">
                        <span className="text-muted-foreground">{eventDate(format, p.receivedAt, "short")}</span>
                        <span className="font-medium">{euro(format, p.amountCents)}</span>
                        {p.refundedCents > 0 && <span className="text-muted-foreground">−{euro(format, p.refundedCents)}</span>}
                        {canPay && p.kind !== "refund" && p.amountCents > p.refundedCents && (
                          <RefundDialog
                            paymentId={p.id}
                            refundableCents={p.amountCents - p.refundedCents}
                            refundableLabel={euro(format, p.amountCents - p.refundedCents)}
                            online={p.method === "stripe"}
                          />
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("messages.title")}</CardTitle>
              <CardDescription>{t("messages.bookingHint")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/app/messages/${booking.trackingCode}?channel=customer`}>
                  <MessagesSquareIcon />
                  {t("messages.channel_customer")}
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/app/messages/${booking.trackingCode}?channel=artist`}>
                  <MessagesSquareIcon />
                  {t("messages.channel_artist")}
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("booking.notesTitle")}</CardTitle>
              <CardDescription>{t("booking.notesHint")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <AddNote bookingId={booking.id} />
              {booking.notes.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("booking.noNotes")}</p>
              ) : (
                <ul className="grid gap-3">
                  {booking.notes.map((n) => (
                    <li key={n.id} className="rounded-lg border p-3 text-sm">
                      <p className="whitespace-pre-line">{n.body}</p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {nameOf(n.authorId)} · {dateTime(format, n.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("booking.customer")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              {booking.customer ? (
                <>
                  <p className="font-medium">{booking.customer.name}</p>
                  <a href={`mailto:${booking.customer.email}`} className="text-primary underline-offset-4 hover:underline">
                    {booking.customer.email}
                  </a>
                  {booking.customer.phone && <p className="tabular-nums">{booking.customer.phone}</p>}
                </>
              ) : (
                <p className="text-muted-foreground">{t("bookings.noCustomer")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("booking.artist")}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              {activeAssignment ? (
                <div className="grid gap-1">
                  <p className="font-medium">{activeAssignment.artist.stageName}</p>
                  {activeAssignment.artist.organizationId !== organization.id && (
                    <p className="text-muted-foreground">{t("booking.sharedFrom", { agency: activeAssignment.artist.organization.name })}</p>
                  )}
                  <div>
                    <AssignmentStatusBadge status={activeAssignment.status as "pending"} />
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">{t("booking.noArtist")}</p>
              )}
              {lastDeclined && (
                <p className="rounded-lg bg-destructive/10 p-2 text-destructive">
                  {t("timeline.artist_declined", { reason: lastDeclined.declineReason ?? "" })} ({lastDeclined.artist.stageName})
                </p>
              )}
              {canAssign ? (
                <AssignArtist bookingId={booking.id} options={artistOptions} hasArtist={Boolean(activeAssignment)} />
              ) : (
                ["inquiry", "quoted", "expired"].includes(status) && <p className="text-muted-foreground">{t("booking.assignBlocked")}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("booking.timeline")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-3 border-l pl-4 text-sm">
                {booking.events.map((e) => (
                  <li key={String(e.id)} className="relative">
                    <span className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-primary" aria-hidden />
                    <p>{timelineText(e)}</p>
                    <p className="text-xs text-muted-foreground">
                      {dateTime(format, e.createdAt)}
                      {nameOf(e.actorId) && ` · ${nameOf(e.actorId)}`}
                    </p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Detail({ icon: Icon, label, children }: { icon?: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
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

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5 rounded-lg bg-muted/60 p-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

