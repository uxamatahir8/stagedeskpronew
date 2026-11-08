import type { EmailLocale } from "./copy";
import type { EmailJob, EmailKind } from "./index";

type Params<K extends EmailKind> = Extract<EmailJob, { kind: K }>["params"];

/**
 * Example values for every email, used by the admin's email previews. The
 * type makes this exhaustive: a new email kind needs a sample here.
 */
export function emailSamples(locale: EmailLocale, appUrl: string): { [K in EmailKind]: Params<K> } {
  const nl = locale === "nl";
  const url = (path: string) => `${appUrl}${nl ? "/nl" : ""}${path}`;
  return {
    verifyEmail: { locale, name: "Sanne", url: `${appUrl}/api/auth/verify-email?token=example` },
    loginCode: { locale, code: "482913" },
    resetPassword: { locale, name: "Sanne", url: url("/reset-password?token=example") },
    artistAccountSetup: { locale, name: "DJ Daan", url: url("/reset-password?token=example&setup=1") },
    accountSetup: { locale, name: "Iris", url: url("/reset-password?token=example&setup=1") },
    inquiryReceived: { locale, name: "Sanne", agency: "Feestband Utrecht", code: "K7Q2M9XA", url: url("/app/event") },
    newInquiry: { locale, customer: "Sanne de Vries", event: nl ? "Bruiloft" : "Wedding", date: nl ? "zaterdag 14 juni 2027" : "Saturday 14 June 2027", url: url("/app/bookings/K7Q2M9XA") },
    quote: {
      locale,
      name: "Sanne",
      agency: "Feestband Utrecht",
      total: "€ 1.082,95",
      until: nl ? "28 oktober 2026" : "28 October 2026",
      url: `${appUrl}/q/example`,
      reference: "K7Q2M9XA",
      event: nl ? "Bruiloft" : "Wedding",
      date: nl ? "zaterdag 14 juni 2027, 20:00–01:00" : "Saturday 14 June 2027, 8 pm–1 am",
      venue: "Kasteel de Haar, Haarzuilens",
      lines: [
        { description: nl ? "DJ, per uur" : "DJ, per hour", quantity: "5", unitPrice: "€ 150,00", total: "€ 750,00" },
        { description: nl ? "Licht en geluid" : "Lights and sound", quantity: "1", unitPrice: "€ 145,00", total: "€ 145,00" },
      ],
      subtotal: "€ 895,00",
      vat: [{ label: nl ? "Btw 21%" : "VAT 21%", amount: "€ 187,95" }],
      deposit: "€ 324,89",
      balance: "€ 758,06",
      contactEmail: "info@feestband.nl",
      contactPhone: "030 123 4567",
      pdfUrl: `${appUrl}/api/pdf/quote/example`,
    },
    quoteAcceptedNotice: { locale, update: "quoteAccepted", customer: "Sanne de Vries", code: "K7Q2M9XA", event: nl ? "bruiloft" : "wedding", date: nl ? "12 juni 2027" : "12 June 2027", url: `${appUrl}/app/bookings/K7Q2M9XA` },
    artistAcceptedNotice: { locale, update: "artistAccepted", artist: "DJ Sem", code: "K7Q2M9XA", event: nl ? "bruiloft" : "wedding", date: nl ? "12 juni 2027" : "12 June 2027", url: `${appUrl}/app/bookings/K7Q2M9XA` },
    artistDeclinedNotice: { locale, update: "artistDeclined", artist: "DJ Sem", code: "K7Q2M9XA", event: nl ? "bruiloft" : "wedding", date: nl ? "12 juni 2027" : "12 June 2027", reason: nl ? "Al geboekt die avond" : "Already booked that evening", url: `${appUrl}/app/bookings/K7Q2M9XA` },
    bookingConfirmed: { locale, update: "bookingConfirmed", name: "Sanne", agency: "Feestband Utrecht", code: "K7Q2M9XA", event: nl ? "bruiloft" : "wedding", date: nl ? "12 juni 2027" : "12 June 2027", url: `${appUrl}/app/event?booking=K7Q2M9XA` },
    bookingCancelled: { locale, update: "bookingCancelled", name: "Sanne", agency: "Feestband Utrecht", code: "K7Q2M9XA", event: nl ? "bruiloft" : "wedding", date: nl ? "12 juni 2027" : "12 June 2027", url: `${appUrl}/app/event?booking=K7Q2M9XA` },
    invoiceIssued: { locale, update: "invoiceIssued", name: "Sanne", agency: "Feestband Utrecht", code: "K7Q2M9XA", event: nl ? "bruiloft" : "wedding", url: `${appUrl}/q/example` },
    reviewInvitation: { locale, update: "reviewInvitation", name: "Sanne", agency: "Feestband Utrecht", code: "K7Q2M9XA", event: nl ? "bruiloft" : "wedding", url: `${appUrl}/app/event?booking=K7Q2M9XA` },
    gigAssigned: { locale, status: "new", name: "Sem", agency: "Feestband Utrecht", event: nl ? "bruiloft" : "wedding", date: nl ? "zaterdag 14 juni 2027" : "Saturday 14 June 2027", venue: "Haarzuilens", url: url("/app/gigs/K7Q2M9XA") },
    bookingDetailsRequest: { locale, name: "Sanne", agency: "Feestband Utrecht", until: nl ? "16 november 2026" : "16 November 2026", url: url("/d/example") },
    changeDecision: {
      locale,
      name: "Sanne",
      agency: "Feestband Utrecht",
      code: "K7Q2M9XA",
      event: nl ? "bruiloft" : "wedding",
      approved: true,
      changes: [nl ? "Datum: 14 juni 2027 → 21 juni 2027" : "Date: 14 June 2027 → 21 June 2027"],
      details: [nl ? "Datum: 21 juni 2027" : "Date: 21 June 2027", nl ? "Locatie: Tivoli, Utrecht" : "Venue: Tivoli, Utrecht"],
      note: nl ? "Tot dan!" : "See you then!",
      contact: "info@feestband.nl",
      url: url("/app/event?booking=K7Q2M9XA"),
    },
    senderTest: { locale, agency: "Feestband Utrecht", replyTo: "info@feestband.nl" },
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
    agencyCreated: { locale, name: "Olga", agency: "Feestbureau Noord", url: url("/reset-password?token=example&setup=1"), setup: true },
    leadReceived: { locale, name: "Lotte", reference: "L-7KQ2M9", url: url("/") },
    artistRequest: { locale, status: "new", other: "Feestband Utrecht", artist: "DJ Daan K", event: nl ? "bruiloft" : "wedding", fee: "€ 600,00", url: url("/app/artist-requests") },
    leadQuote: { locale, name: "Lotte", provider: "Feestband Utrecht", event: nl ? "bruiloft" : "wedding", total: "€ 1.450,00", url: url("/request/L-7KQ2M9?t=preview") },
    leadWon: { locale, name: "Lotte de Vries", event: nl ? "bruiloft" : "wedding", code: "3TPH5794", url: url("/app/bookings/3TPH5794") },
    leadLost: { locale, event: nl ? "bruiloft" : "wedding", reference: "L-7KQ2M9", url: url("/app/lead-offers") },
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
    newsletterConfirm: { locale, name: "Sanne", url: url("/newsletter/confirm?token=voorbeeld") },
    newsletter: {
      locale,
      subject: nl ? "Nieuw bij StageDesk: oktober" : "New at StageDesk: October",
      body: nl
        ? "Hoi! Dit is wat er deze maand nieuw is.\n\n- Zoeken en filteren in elke lijst\n- Proefperiode per abonnement"
        : "Hi! Here is what's new this month.\n\n- Search and filters on every list\n- Trial per plan",
      articles: [
        {
          title: nl ? "Aanbetaling vragen zonder gedoe" : "Taking deposits without the hassle",
          excerpt: nl ? "Waarom een aanbetaling je planning beschermt." : "Why a deposit protects your schedule.",
          url: url("/blog/aanbetaling-en-uitbetaling"),
          cover: "/content/covers/aanbetaling-en-uitbetaling.webp",
        },
      ],
      unsubscribeUrl: url("/newsletter/unsubscribe?token=voorbeeld"),
    },
  };
}
