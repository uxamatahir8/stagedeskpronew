import type { EmailLocale } from "./copy";
import type { EmailJob, EmailKind } from "./index";

type Params<K extends EmailKind> = Extract<EmailJob, { kind: K }>["params"];

/**
 * Example values for every email, used by the admin's email previews. The
 * type makes this exhaustive: a new email kind needs a sample here.
 */
export function emailSamples(locale: EmailLocale, appUrl: string): { [K in EmailKind]: Params<K> } {
  const nl = locale === "nl";
  const url = (path: string) => `${appUrl}${nl ? "" : "/en"}${path}`;
  return {
    verifyEmail: { locale, name: "Sanne", url: `${appUrl}/api/auth/verify-email?token=example` },
    loginCode: { locale, code: "482913" },
    resetPassword: { locale, name: "Sanne", url: url("/reset-password?token=example") },
    inquiryReceived: { locale, name: "Sanne", agency: "Feestband Utrecht", code: "K7Q2M9XA", url: url("/app/event") },
    newInquiry: { locale, customer: "Sanne de Vries", event: nl ? "Bruiloft" : "Wedding", date: nl ? "zaterdag 14 juni 2027" : "Saturday 14 June 2027", url: url("/app/bookings/K7Q2M9XA") },
    quote: { locale, name: "Sanne", agency: "Feestband Utrecht", total: "€ 1.082,95", until: nl ? "28 oktober 2026" : "28 October 2026", url: `${appUrl}/q/example` },
    invitation: { locale, agency: "Feestband Utrecht", inviter: "Mark de Boer", role: nl ? "artiest" : "artist", url: url("/invite/example") },
    affiliateApproved: { locale, name: "Pim", link: `${appUrl}/?via=pim`, promo: "PIM20", url: url("/app/links") },
    affiliatePayout: { locale, name: "Pim", amount: "€ 74,50", lines: ["Feestband Utrecht · € 37,25", "Rotterdam DJ Collectief · € 37,25"], url: url("/app/payouts") },
    newMessage: {
      locale,
      name: "Feestband Utrecht",
      code: "K7Q2M9XA",
      excerpt: nl ? "Hoi Sanne, we hebben de playlist ontvangen. Zullen we de openingsdans om 21:00 doen?" : "Hi Sanne, we've got the playlist. Shall we do the first dance at 9 pm?",
      url: url("/app/messages/K7Q2M9XA"),
    },
    eventReminder: { locale, days: 7, name: "Sanne", event: nl ? "Bruiloft" : "Wedding", date: nl ? "zaterdag 14 juni 2027" : "Saturday 14 June 2027", agency: "Feestband Utrecht", url: url("/app/event") },
    gigReminder: { locale, name: "Sem", event: nl ? "Bruiloft" : "Wedding", date: nl ? "zaterdag 14 juni 2027, 20:00" : "Saturday 14 June 2027, 8 pm", venue: "Kasteel de Haar, Haarzuilens", url: url("/app/gigs/K7Q2M9XA") },
    quoteExpiring: { locale, name: "Sanne", agency: "Feestband Utrecht", until: nl ? "morgen" : "tomorrow", url: `${appUrl}/q/example` },
    balanceDue: { locale, name: "Sanne", amount: "€ 758,06", date: nl ? "31 mei 2027" : "31 May 2027", agency: "Feestband Utrecht", url: url("/app/my-payments") },
    ticketReply: {
      locale,
      name: "Mark",
      ref: "SUP-1042",
      subject: nl ? "iDEAL-betaling niet zichtbaar" : "iDEAL payment not showing",
      excerpt: nl ? "De betaling is binnen en staat nu bij de boeking." : "The payment has arrived and is now on the booking.",
      url: url("/app/support/SUP-1042"),
    },
    contactMessage: { locale, name: "Lotte Jansen", email: "lotte@example.nl", company: "Lotte Events", message: nl ? "Ik wil graag een demo voor ons bureau met 12 DJ's." : "I'd like a demo for our agency with 12 DJs." },
    agencyCreated: { locale, name: "Olga", agency: "Feestbureau Noord", url: url("/sign-in") },
    leadReceived: { locale, name: "Lotte", reference: "L-7KQ2M9", url: url("/") },
    leadOffer: { locale, agency: "Feestband Utrecht", event: nl ? "bruiloft" : "wedding", date: nl ? "14 juni 2027" : "14 June 2027", city: "Utrecht", url: url("/app/lead-offers") },
    paymentReceipt: {
      locale,
      name: "Sanne",
      agency: "Feestband Utrecht",
      code: "K7Q2M9XA",
      amount: "€ 324,89",
      method: nl ? "bankoverschrijving" : "bank transfer",
      date: nl ? "20 oktober 2026" : "20 October 2026",
      paid: "€ 324,89",
      remaining: "€ 758,06",
      url: url("/app/my-payments"),
    },
    paymentNotReceived: {
      locale,
      name: "Sanne",
      agency: "Feestband Utrecht",
      code: "K7Q2M9XA",
      amount: "€ 324,89",
      reason: nl ? "We zien nog geen bijschrijving met dit kenmerk." : "We can't see a transfer with this reference yet.",
      url: url("/app/my-payments"),
    },
    paymentReported: { locale, customer: "Sanne de Vries", amount: "€ 324,89", method: nl ? "bankoverschrijving" : "bank transfer", code: "K7Q2M9XA", url: url("/app/bookings/K7Q2M9XA") },
  };
}
