import { localePrefix } from "@stagedesk/core";
import { agencyDeskUserIds, balancesDue, eventsInDays, notify, quotesExpiringWithin, withReminder } from "@stagedesk/db";
import type { EmailJob } from "@stagedesk/emails";

type Locale = "nl" | "en";
const localeOf = (value: string | null | undefined): Locale => (value === "nl" ? "nl" : "en");
/** A customer gets reminders in the language their quote was sent in; before quotes stored one, their account's. */
const customerLocale = (b: { quotes: { locale: string | null }[] }, customer: { locale: string | null }): Locale => {
  const sent = b.quotes[0]?.locale;
  return sent === "nl" || sent === "en" ? sent : localeOf(customer.locale);
};
/** Customer mail is signed by the agency (display name and Reply-To; the address stays the platform's). */
const senderOf = (org: { name: string; emailFromName: string | null; emailReplyTo: string | null; contactEmail: string | null }) => ({
  name: org.emailFromName?.trim() || org.name,
  replyTo: org.emailReplyTo || org.contactEmail,
});
const appUrl = process.env["APP_URL"] ?? process.env["BETTER_AUTH_URL"] ?? "http://localhost:3000";
const link = (locale: Locale, path: string) => `${appUrl}${localePrefix(locale)}${path}`;
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
 * quote-expiry reminders, and a balance-due reminder. Each is claimed in
 * reminder_logs and the claim is given back if queuing fails (Redis down), so
 * it's retried on the next run instead of being lost; its emails carry a job
 * id per reminder and recipient, so a retry doesn't queue a job twice. One
 * reminder failing doesn't stop the others.
 */
export async function sendReminders(queue: (job: EmailJob, jobId?: string) => Promise<unknown>, now = new Date()) {
  let sent = 0;
  let failed = 0;
  const attempt = async (key: string, send: () => Promise<void>) => {
    try {
      if (await withReminder(key, send)) sent++;
    } catch (error) {
      failed++;
      console.error(`[reminders] ${key} not queued; will retry next run`, error);
    }
  };

  for (const days of [7, 1]) {
    for (const b of await eventsInDays(days, now)) {
      if (!b.eventDate) continue;
      const eventDate = b.eventDate;
      const key = `event-${days}:${b.id}`;
      await attempt(key, async () => {
        const artist = b.assignments[0]?.artist;
        if (b.customer) {
          const locale = customerLocale(b, b.customer);
          await queue(
            {
              kind: "eventReminder",
              to: b.customer.email,
              sender: senderOf(b.organization),
              params: { locale, days, name: firstName(b.customer.name), event: eventNames[locale][b.eventType] ?? b.eventType, date: date(locale, eventDate), agency: b.organization.name, url: link(locale, `/app/event?booking=${b.trackingCode}`) },
            },
            `${key}:customer`,
          );
        }
        if (artist?.user) {
          const locale = localeOf(artist.user.locale);
          await queue(
            {
              kind: "gigReminder",
              to: artist.user.email,
              params: { locale, name: firstName(artist.user.name), event: eventNames[locale][b.eventType] ?? b.eventType, date: date(locale, eventDate), venue: [b.venueName, b.venueCity].filter(Boolean).join(", "), url: link(locale, `/app/gigs/${b.trackingCode}`) },
            },
            `${key}:artist`,
          );
        }
        await notify([b.customer?.id, artist?.user?.id, ...(await agencyDeskUserIds(b.organizationId))], {
          type: "reminder_event",
          data: { days, code: b.trackingCode, name: b.customer?.name ?? b.trackingCode },
          url: `/app/bookings/${b.trackingCode}`,
        });
      });
    }
  }

  for (const b of await quotesExpiringWithin(48, now)) {
    const quote = b.quotes[0];
    const customer = b.customer;
    if (!quote || !customer) continue;
    const key = `quote-expiring:${quote.id}`;
    await attempt(key, async () => {
      const locale = customerLocale(b, customer);
      await queue(
        {
          kind: "quoteExpiring",
          to: customer.email,
          sender: senderOf(b.organization),
          params: {
            locale,
            name: firstName(customer.name),
            agency: b.organization.name,
            until: new Intl.DateTimeFormat(intl(locale), { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(quote.expiresAt),
            url: link(locale, `/q/${quote.token}`),
          },
        },
        key,
      );
    });
  }

  for (const b of await balancesDue(now)) {
    const customer = b.customer;
    if (!customer || !b.eventDate) continue;
    const eventDate = b.eventDate;
    const key = `balance:${b.id}`;
    await attempt(key, async () => {
      const locale = customerLocale(b, customer);
      await queue(
        {
          kind: "balanceDue",
          to: customer.email,
          sender: senderOf(b.organization),
          params: { locale, name: firstName(customer.name), amount: money(locale, b.totalCents - b.paidCents, b.currency), date: date(locale, eventDate), agency: b.organization.name, url: link(locale, "/app/my-payments") },
        },
        key,
      );
    });
  }
  return { sent, failed };
}
