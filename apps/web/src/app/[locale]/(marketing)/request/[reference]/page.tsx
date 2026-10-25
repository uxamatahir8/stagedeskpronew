import { CalendarIcon, CheckCircle2Icon, ClockIcon, InboxIcon, MapPinIcon, StarIcon, UsersIcon } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import type { EventType } from "@stagedesk/core";
import { leadForCustomer } from "@stagedesk/db";
import { Pill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { eventDate, euro, percent } from "@/lib/format";
import { AcceptOfferButton } from "./accept-button";

export async function generateMetadata({ params }: PageProps<"/[locale]/request/[reference]">): Promise<Metadata> {
  const t = await getTranslations({ locale: (await params).locale as Locale, namespace: "leadCompare" });
  // A private page: the link in the customer's email is the key.
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

export default async function RequestComparePage({ params, searchParams }: PageProps<"/[locale]/request/[reference]">) {
  setRequestLocale((await params).locale as Locale);
  return (
    <main className="mx-auto grid w-full max-w-5xl gap-8 px-5 py-14 sm:px-8 sm:py-20">
      <Suspense fallback={<Skeleton className="h-[30rem] w-full" />}>
        <Compare params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Compare({ params, searchParams }: Pick<PageProps<"/[locale]/request/[reference]">, "params" | "searchParams">) {
  // Prices expire, so the page compares against the time of each request.
  await connection();
  const [{ reference }, sp, t, te, format] = await Promise.all([params, searchParams, getTranslations("leadCompare"), getTranslations("eventTypes"), getFormatter()]);
  const token = typeof sp["t"] === "string" ? sp["t"] : "";
  const data = token ? await leadForCustomer(reference, token) : null;
  if (!data) {
    return (
      <div className="grid justify-items-center gap-3 py-16 text-center">
        <h1 className="text-2xl font-semibold">{t("notFoundTitle")}</h1>
        <p className="max-w-md text-muted-foreground">{t("notFoundBody")}</p>
        <Button asChild variant="outline">
          <Link href="/request">{t("newRequest")}</Link>
        </Button>
      </div>
    );
  }
  const { lead, offers, booking } = data;
  const open = lead.status === "new" || lead.status === "offered";
  const winner = offers.find((o) => o.status === "accepted");
  const shown = [...offers].sort((a, b) => Number(a.expired) - Number(b.expired) || a.totalCents - b.totalCents);

  return (
    <>
      <header className="grid gap-4">
        <p className="text-sm font-medium text-magenta">{t("eyebrow", { reference: lead.reference })}</p>
        <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{t("title", { name: lead.name.split(/\s+/)[0] ?? lead.name })}</h1>
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <CalendarIcon className="size-4" aria-hidden />
            {te(lead.eventType as EventType)} · {eventDate(format, lead.eventDate) ?? "—"}
          </li>
          {lead.venueCity && (
            <li className="flex items-center gap-1.5">
              <MapPinIcon className="size-4" aria-hidden />
              {[lead.venueName, lead.venueCity].filter(Boolean).join(", ")}
            </li>
          )}
          {lead.guestCount && (
            <li className="flex items-center gap-1.5">
              <UsersIcon className="size-4" aria-hidden />
              {t("guests", { count: lead.guestCount })}
            </li>
          )}
        </ul>
      </header>

      {winner && (
        <section className="grid gap-3 rounded-2xl border border-success/30 bg-success/8 p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CheckCircle2Icon className="size-5 text-success" aria-hidden />
            {t("bookedTitle", { provider: winner.provider.name })}
          </h2>
          <p className="text-sm text-muted-foreground">{t("bookedBody", { code: booking?.trackingCode ?? "" })}</p>
          <Button asChild className="w-fit">
            <Link href={`/sign-in?next=${encodeURIComponent("/app/event")}`}>{t("followEvent")}</Link>
          </Button>
        </section>
      )}
      {!winner && lead.status === "closed" && <p className="rounded-xl border bg-muted/40 p-4 text-sm">{t("closed")}</p>}

      <section className="grid gap-4" aria-labelledby="prices">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="prices" className="text-xl font-semibold">
            {t("pricesTitle", { count: offers.length })}
          </h2>
          {open && offers.length > 0 && <p className="text-sm text-muted-foreground">{t("pricesHint")}</p>}
        </div>

        {offers.length === 0 ? (
          <div className="grid justify-items-center gap-2 rounded-2xl border border-dashed p-10 text-center">
            <InboxIcon className="size-8 text-muted-foreground" aria-hidden />
            <p className="font-medium">{t("waitingTitle")}</p>
            <p className="max-w-md text-sm text-muted-foreground">{t("waitingBody")}</p>
          </div>
        ) : (
          <ul className="grid gap-4">
            {shown.map((o) => (
              <li key={o.id} className="grid gap-4 rounded-2xl border bg-card p-5 shadow-xs sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-white text-lg font-bold text-primary">
                      {o.provider.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element -- served from /files
                        <img src={o.provider.logo} alt="" className="size-full object-contain" />
                      ) : (
                        o.provider.name.charAt(0).toUpperCase()
                      )}
                    </span>
                    <div className="grid gap-0.5">
                      <span className="font-semibold">{o.provider.name}</span>
                      <span className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                        {o.provider.city}
                        {o.rating ? (
                          <span className="flex items-center gap-1">
                            <StarIcon className="size-3.5 fill-warning text-warning" aria-hidden />
                            {t("rating", { average: format.number(o.rating.average, { maximumFractionDigits: 1 }), count: o.rating.count })}
                          </span>
                        ) : (
                          <span>{t("newProvider")}</span>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="grid justify-items-end gap-1 text-right">
                    <span className="text-2xl font-bold tabular-nums">{euro(format, o.totalCents, o.currency)}</span>
                    <span className="text-xs text-muted-foreground">
                      {t("inclVat")}
                      {o.depositCents > 0 && ` · ${t("deposit", { amount: euro(format, o.depositCents, o.currency) })}`}
                    </span>
                  </div>
                </div>

                <ul className="grid gap-1 rounded-xl bg-muted/50 p-3 text-sm">
                  {o.lines.map((l, i) => (
                    <li key={i} className="flex justify-between gap-4">
                      <span>
                        {l.quantityHundredths !== 100 && <span className="text-muted-foreground tabular-nums">{format.number(l.quantityHundredths / 100)} × </span>}
                        {l.description}
                      </span>
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {euro(format, Math.round((l.quantityHundredths * l.unitPriceCents) / 100), o.currency)} <span className="text-xs">+ {percent(format, l.vatBps)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                {o.message && <p className="text-sm whitespace-pre-line">{o.message}</p>}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ClockIcon className="size-3.5" aria-hidden />
                    {o.expired ? t("expired") : o.validUntil ? t("validUntil", { date: eventDate(format, o.validUntil) ?? "" }) : null}
                  </span>
                  {o.status === "accepted" ? (
                    <Pill tone="success">{t("chosen")}</Pill>
                  ) : (
                    open &&
                    !o.expired && <AcceptOfferButton reference={lead.reference} token={token} offerId={o.id} provider={o.provider.name} total={euro(format, o.totalCents, o.currency)} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
