import { agencyDeskUserIds, balancesDue, claimReminder, eventsInDays, notify, quotesExpiringWithin } from "@stagedesk/db";
import type { EmailJob } from "@stagedesk/emails";

type Locale = "nl" | "en";
const localeOf = (value: string | null | undefined): Locale => (value === "en" ? "en" : "nl");
const appUrl = process.env["APP_URL"] ?? process.env["BETTER_AUTH_URL"] ?? "http://localhost:3000";
const link = (locale: Locale, path: string) => `${appUrl}${locale === "en" ? "/en" : ""}${path}`;
const firstName = (name: string) => name.split(/\s+/)[0] ?? name;
const intl = (locale: Locale) => (locale === "en" ? "en-GB" : "nl-NL");
const date = (locale: Locale, value: Date) => new Intl.DateTimeFormat(intl(locale), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(value);
const money = (locale: Locale, cents: number, currency = "EUR") => new Intl.NumberFormat(intl(locale), { style: "currency", currency }).format(cents / 100);

// Lowercase, as they appear mid-sentence in emails.
const eventNames: Record<Locale, Record<string, string>> = {
  nl: { wedding: "bruiloft", corporate: "bedrijfsfeest", birthday: "verjaardag", party: "feest", festival: "festival", other: "evenement" },
  en: { wedding: "wedding", corporate: "corporate event", birthday: "birthday", party: "party", festival: "festival", other: "event" },
};

/**
 * Event reminders (7 days and 1 day before) to the customer and artist,
 * quote-expiry reminders, and a balance-due reminder. Every reminder is
 * claimed in reminder_logs first, so it's sent at most once.
 */
export async function sendReminders(queue: (job: EmailJob) => Promise<unknown>, now = new Date()) {
  let sent = 0;

  for (const days of [7, 1]) {
    for (const b of await eventsInDays(days, now)) {
      if (!b.eventDate || !(await claimReminder(`event-${days}:${b.id}`))) continue;
      const artist = b.assignments[0]?.artist;
      if (b.customer) {
        const locale = localeOf(b.customer.locale);
        await queue({
          kind: "eventReminder",
          to: b.customer.email,
          params: { locale, days, name: firstName(b.customer.name), event: eventNames[locale][b.eventType] ?? b.eventType, date: date(locale, b.eventDate), agency: b.organization.name, url: link(locale, `/app/event?booking=${b.trackingCode}`) },
        });
      }
      if (artist?.user) {
        const locale = localeOf(artist.user.locale);
        await queue({
          kind: "gigReminder",
          to: artist.user.email,
          params: { locale, name: firstName(artist.user.name), event: eventNames[locale][b.eventType] ?? b.eventType, date: date(locale, b.eventDate), venue: [b.venueName, b.venueCity].filter(Boolean).join(", "), url: link(locale, `/app/gigs/${b.trackingCode}`) },
        });
      }
      await notify([b.customer?.id, artist?.user?.id, ...(await agencyDeskUserIds(b.organizationId))], {
        type: "reminder_event",
        data: { days, code: b.trackingCode, name: b.customer?.name ?? b.trackingCode },
        url: `/app/bookings/${b.trackingCode}`,
      });
      sent++;
    }
  }

  for (const b of await quotesExpiringWithin(48, now)) {
    const quote = b.quotes[0];
    if (!quote || !b.customer || !(await claimReminder(`quote-expiring:${quote.id}`))) continue;
    const locale = localeOf(b.customer.locale);
    await queue({
      kind: "quoteExpiring",
      to: b.customer.email,
      params: {
        locale,
        name: firstName(b.customer.name),
        agency: b.organization.name,
        until: new Intl.DateTimeFormat(intl(locale), { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(quote.expiresAt),
        url: link(locale, `/q/${quote.token}`),
      },
    });
    sent++;
  }

  for (const b of await balancesDue(now)) {
    if (!b.customer || !b.eventDate || !(await claimReminder(`balance:${b.id}`))) continue;
    const locale = localeOf(b.customer.locale);
    await queue({
      kind: "balanceDue",
      to: b.customer.email,
      params: { locale, name: firstName(b.customer.name), amount: money(locale, b.totalCents - b.paidCents, b.currency), date: date(locale, b.eventDate), agency: b.organization.name, url: link(locale, "/app/my-payments") },
    });
    sent++;
  }
  return { sent };
}
