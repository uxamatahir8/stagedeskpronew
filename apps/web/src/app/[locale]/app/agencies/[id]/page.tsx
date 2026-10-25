import { ArrowLeftIcon, CalendarCheckIcon, CalendarPlusIcon, CreditCardIcon, ExternalLinkIcon, EuroIcon, LifeBuoyIcon, Music2Icon, UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { getFormatter } from "@/lib/formatter";
import { type BookingStatus, type EventType, feeRuleSchema } from "@stagedesk/core";
import { activePlans, agencyOverview, prisma } from "@stagedesk/db";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { BookingStatusBadge, Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { startSupportAction } from "@/lib/support-actions";
import type { Locale } from "@/i18n/routing";
import { dateTime, euro, eventDate } from "@/lib/format";
import { requirePermission } from "@/lib/viewer";
import { FeeDealDialog } from "../fee-deal";
import { DeleteAgencyButton, DetailsForm, SubscriptionControls, SuspendButton } from "./agency-controls";

export async function generateMetadata({ params }: PageProps<"/[locale]/app/agencies/[id]">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "agencies" });
  return { title: t("title") };
}

export default function AgencyPage({ params }: PageProps<"/[locale]/app/agencies/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[40rem] w-full" />}>
      <Agency params={params} />
    </Suspense>
  );
}

const statusTone = { trialing: "info", active: "success", past_due: "warning", unpaid: "danger", canceled: "neutral", incomplete: "warning" } as const;

async function Agency({ params }: Pick<PageProps<"/[locale]/app/agencies/[id]">, "params">) {
  const { locale, id } = await params;
  setRequestLocale(locale as Locale);
  await requirePermission("platform.agencies");
  const kind = (await prisma.organization.findUnique({ where: { id }, select: { kind: true } }))?.kind;
  // An independent artist gets Artist plans; agencies the agency plans.
  const [overview, plans] = await Promise.all([agencyOverview(id), activePlans(kind === "solo" ? "artist" : "agency")]);
  if (!overview) notFound();
  const { org, access, stats, recent, activity } = overview;
  const [t, ts, tr, te, tau, format, lang] = await Promise.all([
    getTranslations("agencyAdmin"),
    getTranslations("subStatus"),
    getTranslations("roles"),
    getTranslations("eventTypes"),
    getTranslations("audit"),
    getFormatter(),
    getLocale(),
  ]);
  const sub = org.subscription;
  const planName = (name: unknown, key: string) => String(((name ?? {}) as Record<string, string>)[lang] ?? key);
  const fee = feeRuleSchema.safeParse(org.feeRule);
  const bookingCount = Object.values(stats.bookingsByStatus).reduce((a, b) => a + b, 0);
  // An independent artist owns their one-person business as solo_artist.
  const owner = org.members.find((m) => m.role === "agency_owner" || m.role === "solo_artist")?.user;
  const stripe = org.connectedAccounts[0];

  return (
    <div className="grid gap-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href={kind === "solo" ? "/app/independent-artists" : "/app/agencies"}>
          <ArrowLeftIcon />
          {kind === "solo" ? (await getTranslations("soloAdmin"))("allArtists") : t("allAgencies")}
        </Link>
      </Button>
      <PageHeader
        title={kind === "solo" ? `${org.name} · ${(await getTranslations("roles"))("solo_artist")}` : org.name}
        description={[org.city, owner ? `${owner.name} · ${owner.email}` : null, t("since", { date: format.dateTime(org.createdAt, { day: "numeric", month: "long", year: "numeric" }) })].filter(Boolean).join(" · ")}
        actions={
          <div className="flex flex-wrap gap-2">
            {!org.suspendedAt && (
              <Button asChild>
                <Link href={`/app/agencies/${org.id}/new-booking`}>
                  <CalendarPlusIcon />
                  {t("newBooking")}
                </Link>
              </Button>
            )}
            <form action={startSupportAction.bind(null, org.id, "/app")}>
              <Button type="submit" variant="outline">
                <LifeBuoyIcon />
                {t("openAsSupport")}
              </Button>
            </form>
            <Button asChild variant="outline">
              <a href={`/b/${org.slug}`} target="_blank" rel="noopener">
                <ExternalLinkIcon />
                {t("bookingPage")}
              </a>
            </Button>
            <FeeDealDialog variant="outline" organizationId={org.id} agency={org.name} rule={org.feeRule && fee.success ? fee.data : null} />
            <SuspendButton organizationId={org.id} suspended={Boolean(org.suspendedAt)} />
            <DeleteAgencyButton organizationId={org.id} name={org.name} canDelete={bookingCount === 0} />
          </div>
        }
      />

      {org.suspendedAt && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/8 px-4 py-3 text-sm">
          <span className="font-medium">{t("suspendedSince", { date: dateTime(format, org.suspendedAt) })}</span>
          {org.suspendReason && <span className="text-muted-foreground"> · {org.suspendReason}</span>}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} label={t("bookings")} value={bookingCount} hint={t("bookedValue", { amount: euro(format, stats.bookedCents, org.currency) })} icon={CalendarCheckIcon} />
        <StatCard index={1} label={t("received")} value={euro(format, stats.receivedCents, org.currency)} hint={t("thisMonth", { amount: euro(format, stats.receivedMonthCents, org.currency) })} icon={EuroIcon} />
        <StatCard index={2} label={t("artists")} value={stats.artists} icon={Music2Icon} />
        <StatCard index={3} label={t("customers")} value={stats.customers} icon={UsersIcon} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {t("subscription")}
              {sub && <Pill tone={statusTone[sub.status as keyof typeof statusTone] ?? "neutral"}>{ts(sub.status as "active")}</Pill>}
              {sub?.complimentary && <Pill tone="brand">{t("complimentary")}</Pill>}
            </CardTitle>
            <CardDescription>
              {sub ? planName(sub.plan.name, sub.plan.key) : t("noSubscription")}
              {sub?.trialEndsAt && sub.status === "trialing" && ` · ${t("trialUntil", { date: dateTime(format, sub.trialEndsAt) })}`}
              {access.level === "read_only" && ` · ${t("readOnly")}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SubscriptionControls organizationId={org.id} plans={plans.map((p) => ({ key: p.key, name: planName(p.name, p.key) }))} currentPlanKey={sub?.plan.key ?? null} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCardIcon className="size-4 text-muted-foreground" aria-hidden />
              {t("setup")}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <Row label={t("onlinePayments")} value={stripe?.payoutsEnabled ? <Pill tone="success">{t("connected")}</Pill> : <Pill tone="neutral">{t("notConnected")}</Pill>} />
            <Row label={t("bookingPageStatus")} value={org.bookingPageEnabled && !org.suspendedAt ? <Pill tone="success">{t("online")}</Pill> : <Pill tone="neutral">{t("offline")}</Pill>} />
            <Row label={t("feeDeal")} value={org.feeRule ? t("customFee") : t("standardFee")} />
            <Row
              label={t("cameVia")}
              value={org.referral ? (org.referral.affiliate ? t("viaPartner", { name: org.referral.affiliate.user.name }) : t("viaAgency", { name: org.referral.referringAgency?.name ?? "—" })) : t("direct")}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("team")}</CardTitle>
            <CardDescription>{t("teamHint", { count: org.members.length })}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {org.members
                .filter((m) => m.role !== "customer")
                .map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="grid">
                      <span className="font-medium">{m.user.name}</span>
                      <span className="text-muted-foreground">{m.user.email}</span>
                    </span>
                    <span className="flex gap-1">
                      <Pill tone="brand">{tr(m.role as "agency_owner")}</Pill>
                      {m.user.disabledAt && <Pill tone="danger">{t("disabled")}</Pill>}
                    </span>
                  </li>
                ))}
              {org.invitations.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-muted-foreground">
                  <span>{i.email}</span>
                  <Pill tone="neutral">{t("invited", { role: tr(i.role as "artist") })}</Pill>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("details")}</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailsForm
              organizationId={org.id}
              initial={{
                name: org.name,
                slug: org.slug,
                city: org.city ?? "",
                contactEmail: org.contactEmail ?? "",
                phone: org.phone ?? "",
                website: org.website ?? "",
                kvkNumber: org.kvkNumber ?? "",
                adminNotes: org.adminNotes ?? "",
              }}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("recentBookings")}</CardTitle>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noBookings")}</p>
            ) : (
              <ul className="divide-y text-sm">
                {recent.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="grid">
                      <span className="font-medium">
                        {te(b.eventType as EventType)} · {eventDate(format, b.eventDate, "short") ?? "—"}
                      </span>
                      <span className="text-muted-foreground">
                        <span className="font-mono">{b.trackingCode}</span> · {b.customer?.name ?? "—"}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">{b.totalCents ? euro(format, b.totalCents, b.currency) : ""}</span>
                      <BookingStatusBadge status={b.status as BookingStatus} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("activity")}</CardTitle>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noActivity")}</p>
            ) : (
              <ul className="divide-y text-sm">
                {activity.map((e) => (
                  <li key={String(e.id)} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>{tau.has(`action.${e.action}` as "action.user.disable") ? tau(`action.${e.action}` as "action.user.disable") : e.action}</span>
                    <span className="text-muted-foreground tabular-nums">{dateTime(format, e.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-1.5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
