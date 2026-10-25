import "server-only";
import { prisma } from "@stagedesk/db";
import { absoluteUrl, deliver, userLocale } from "./mail";

/** Emails the customer their quote with the link to accept it (and to make an account if they have none). */
export async function emailQuote(quoteId: string, agencyName: string) {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: { token: true, totalCents: true, expiresAt: true, booking: { select: { currency: true, customer: { select: { name: true, email: true, locale: true, accounts: { where: { providerId: "credential" }, select: { id: true } } } } } } },
  });
  const customer = quote?.booking.customer;
  if (!quote || !customer) return;
  const locale = userLocale(customer.locale);
  const intl = locale === "en" ? "en-GB" : "nl-NL";
  deliver({
    kind: "quote",
    to: customer.email,
    params: {
      locale,
      name: customer.name.split(/\s+/)[0] ?? customer.name,
      agency: agencyName,
      total: new Intl.NumberFormat(intl, { style: "currency", currency: quote.booking.currency }).format(quote.totalCents / 100),
      until: new Intl.DateTimeFormat(intl, { day: "numeric", month: "long", timeZone: "Europe/Amsterdam" }).format(quote.expiresAt),
      url: absoluteUrl(locale, `/q/${quote.token}`),
      // No password yet: invite them to make their own account from the quote page.
      accountUrl: customer.accounts.length === 0 ? absoluteUrl(locale, `/q/${quote.token}#account`) : undefined,
    },
  });
}
