export type EmailLocale = "nl" | "en";

/** All email text in both languages. Templates only arrange it. */
export const copy = {
  nl: {
    footer: "Je ontvangt deze e-mail omdat er een StageDesk-account bij dit adres hoort.",
    ignore: "Heb je dit niet aangevraagd? Dan kun je deze e-mail negeren.",
    linkFallback: "Werkt de knop niet? Kopieer dan deze link:",
    verify: {
      subject: "Bevestig je e-mailadres",
      preview: "Bevestig je e-mailadres om StageDesk te gebruiken.",
      heading: "Bevestig je e-mailadres",
      body: (name: string) => `Hoi ${name}, klik op de knop om je e-mailadres te bevestigen. De link is 24 uur geldig.`,
      button: "E-mailadres bevestigen",
    },
    code: {
      subject: (code: string) => `${code} is je StageDesk-inlogcode`,
      preview: "Je inlogcode voor StageDesk.",
      heading: "Je inlogcode",
      body: "Vul deze code in om in te loggen. De code is 10 minuten geldig.",
    },
    reset: {
      subject: "Stel een nieuw wachtwoord in",
      preview: "Stel een nieuw wachtwoord in voor StageDesk.",
      heading: "Nieuw wachtwoord instellen",
      body: (name: string) => `Hoi ${name}, klik op de knop om een nieuw wachtwoord te kiezen. De link is 1 uur geldig.`,
      button: "Nieuw wachtwoord instellen",
    },
    invitation: {
      subject: (agency: string) => `Je bent uitgenodigd voor ${agency} op StageDesk`,
      preview: "Accepteer je uitnodiging voor StageDesk.",
      heading: (agency: string) => `Word lid van ${agency}`,
      body: (inviter: string, agency: string, role: string) =>
        `${inviter} heeft je uitgenodigd om als ${role} mee te werken aan ${agency} op StageDesk. De uitnodiging is 7 dagen geldig.`,
      button: "Uitnodiging bekijken",
    },
    inquiryReceived: {
      subject: (agency: string) => `We hebben je aanvraag ontvangen – ${agency}`,
      preview: "Je aanvraag is binnen. Je hoort snel van ons.",
      heading: "Bedankt voor je aanvraag",
      body: (name: string, agency: string, code: string) =>
        `Hoi ${name}, ${agency} heeft je aanvraag ontvangen (referentie ${code}). Je ontvangt binnenkort een offerte per e-mail.`,
      follow: "Je kunt je aanvraag altijd volgen door in te loggen met een code die we naar dit adres mailen.",
      button: "Mijn evenement bekijken",
    },
    newInquiry: {
      subject: (customer: string) => `Nieuwe aanvraag van ${customer}`,
      preview: "Er is een nieuwe aanvraag binnengekomen via je boekingspagina.",
      heading: "Nieuwe aanvraag",
      body: (customer: string, event: string, date: string) => `${customer} vraagt een offerte aan voor ${event} op ${date}.`,
      button: "Aanvraag openen",
    },
    affiliateApproved: {
      subject: "Je bent StageDesk-partner",
      preview: "Je aanmelding als partner is goedgekeurd.",
      heading: "Welkom als partner",
      body: (name: string, link: string, promo: string) =>
        `Hoi ${name}, je aanmelding is goedgekeurd. Deel je link ${link} of je code ${promo}: bureaus die zich via jou aanmelden leveren je commissie op over hun abonnement. Koppel een Stripe-account in je dashboard om uitbetaald te worden.`,
      button: "Naar je partnerdashboard",
    },
    affiliatePayout: {
      subject: (amount: string) => `Uitbetaling van ${amount} onderweg`,
      preview: "Je partnercommissie is uitbetaald.",
      heading: "Je uitbetaling",
      body: (name: string, amount: string, count: number) =>
        `Hoi ${name}, we hebben ${amount} overgemaakt naar je Stripe-account voor ${count} goedgekeurde ${count === 1 ? "commissie" : "commissies"}. Stripe zet het geld volgens je uitbetalingsschema op je bankrekening.`,
      button: "Overzicht bekijken",
    },
    newMessage: {
      subject: (name: string) => `Nieuw bericht van ${name}`,
      preview: "Je hebt een nieuw bericht over je boeking.",
      heading: "Nieuw bericht",
      body: (name: string, code: string) => `${name} heeft je een bericht gestuurd over boeking ${code}:`,
      button: "Bericht beantwoorden",
    },
    eventReminder: {
      subject: (days: number) => (days <= 1 ? "Morgen is het zover" : `Nog ${days} dagen tot je feest`),
      preview: "Een herinnering aan je evenement.",
      heading: (days: number) => (days <= 1 ? "Morgen is het zover!" : `Nog ${days} dagen`),
      body: (name: string, event: string, date: string, agency: string) =>
        `Hoi ${name}, je ${event} op ${date} komt eraan. Controleer de details en je wensen (playlist, momenten) zodat ${agency} alles goed kan voorbereiden.`,
      button: "Bekijk je evenement",
    },
    gigReminder: {
      subject: (date: string) => `Optreden op ${date}`,
      preview: "Een herinnering aan je optreden.",
      heading: "Je optreden komt eraan",
      body: (name: string, event: string, date: string, venue: string) => `Hoi ${name}, je speelt op ${date} bij een ${event}${venue ? ` in ${venue}` : ""}. Bekijk de briefing met tijden, playlist en wensen.`,
      button: "Briefing openen",
    },
    quoteExpiring: {
      subject: (agency: string) => `Je offerte van ${agency} verloopt bijna`,
      preview: "Je offerte is nog kort geldig.",
      heading: "Je offerte verloopt bijna",
      body: (name: string, agency: string, until: string) => `Hoi ${name}, de offerte van ${agency} is geldig tot ${until}. Accepteer hem op tijd om je datum vast te leggen.`,
      button: "Offerte bekijken",
    },
    balanceDue: {
      subject: (amount: string) => `Herinnering: nog ${amount} te betalen`,
      preview: "Het restbedrag voor je evenement staat open.",
      heading: "Restbedrag te betalen",
      body: (name: string, amount: string, date: string, agency: string) =>
        `Hoi ${name}, voor je evenement op ${date} staat nog ${amount} open bij ${agency}. Betaal vóór het evenement zodat alles rond is.`,
      button: "Bekijken en betalen",
    },
    ticketReply: {
      subject: (ref: string, subject: string) => `[${ref}] ${subject}`,
      preview: "Support heeft je vraag beantwoord.",
      heading: "Antwoord van support",
      body: (name: string, subject: string) => `Hoi ${name}, we hebben je vraag "${subject}" beantwoord.`,
      button: "Antwoord lezen",
    },
    contactMessage: {
      subject: (name: string) => `Contactformulier: ${name}`,
      preview: "Nieuw bericht via het contactformulier.",
      heading: "Bericht via de website",
      body: (name: string, email: string, company: string) => `${name} (${email}${company ? `, ${company}` : ""}) schreef via het contactformulier:`,
    },
    agencyCreated: {
      subject: (agency: string) => `Je bureau ${agency} staat klaar op StageDesk`,
      preview: "We hebben een StageDesk-account voor je bureau aangemaakt.",
      heading: "Welkom bij StageDesk",
      body: (name: string, agency: string) =>
        `Hoi ${name}, we hebben ${agency} voor je aangemaakt op StageDesk. Log in met je e-mailadres: je krijgt een code per mail, een wachtwoord is niet nodig. Je proefperiode loopt al.`,
      button: "Inloggen",
    },
    quoteSent: {
      subject: (agency: string) => `Je offerte van ${agency}`,
      preview: "Je offerte staat klaar.",
      heading: "Je offerte staat klaar",
      body: (name: string, agency: string, total: string, until: string) =>
        `Hoi ${name}, ${agency} heeft een offerte voor je gemaakt van ${total}. Accepteer hem vóór ${until} om je datum vast te leggen.`,
      button: "Offerte bekijken",
    },
  },
  en: {
    footer: "You're receiving this email because a StageDesk account uses this address.",
    ignore: "Didn't request this? You can ignore this email.",
    linkFallback: "Button not working? Copy this link:",
    verify: {
      subject: "Confirm your email address",
      preview: "Confirm your email address to start using StageDesk.",
      heading: "Confirm your email address",
      body: (name: string) => `Hi ${name}, click the button to confirm your email address. The link is valid for 24 hours.`,
      button: "Confirm email address",
    },
    code: {
      subject: (code: string) => `${code} is your StageDesk sign-in code`,
      preview: "Your StageDesk sign-in code.",
      heading: "Your sign-in code",
      body: "Enter this code to sign in. It's valid for 10 minutes.",
    },
    reset: {
      subject: "Set a new password",
      preview: "Set a new password for StageDesk.",
      heading: "Set a new password",
      body: (name: string) => `Hi ${name}, click the button to choose a new password. The link is valid for 1 hour.`,
      button: "Set new password",
    },
    invitation: {
      subject: (agency: string) => `You're invited to ${agency} on StageDesk`,
      preview: "Accept your StageDesk invitation.",
      heading: (agency: string) => `Join ${agency}`,
      body: (inviter: string, agency: string, role: string) =>
        `${inviter} invited you to work with ${agency} on StageDesk as ${role}. The invitation is valid for 7 days.`,
      button: "View invitation",
    },
    inquiryReceived: {
      subject: (agency: string) => `We've received your inquiry – ${agency}`,
      preview: "Your inquiry is in. You'll hear from us soon.",
      heading: "Thanks for your inquiry",
      body: (name: string, agency: string, code: string) =>
        `Hi ${name}, ${agency} has received your inquiry (reference ${code}). You'll get a quote by email soon.`,
      follow: "You can follow your inquiry any time by signing in with a code we email to this address.",
      button: "View my event",
    },
    newInquiry: {
      subject: (customer: string) => `New inquiry from ${customer}`,
      preview: "A new inquiry came in through your booking page.",
      heading: "New inquiry",
      body: (customer: string, event: string, date: string) => `${customer} is asking for a quote for ${event} on ${date}.`,
      button: "Open inquiry",
    },
    affiliateApproved: {
      subject: "You're a StageDesk partner",
      preview: "Your partner application was approved.",
      heading: "Welcome, partner",
      body: (name: string, link: string, promo: string) =>
        `Hi ${name}, your application was approved. Share your link ${link} or your code ${promo}: agencies that sign up through you earn you commission on their subscription. Connect a Stripe account in your dashboard to get paid.`,
      button: "Open your partner dashboard",
    },
    affiliatePayout: {
      subject: (amount: string) => `Payout of ${amount} on its way`,
      preview: "Your partner commission has been paid out.",
      heading: "Your payout",
      body: (name: string, amount: string, count: number) =>
        `Hi ${name}, we've transferred ${amount} to your Stripe account for ${count} approved ${count === 1 ? "commission" : "commissions"}. Stripe moves it to your bank account on your payout schedule.`,
      button: "View statement",
    },
    newMessage: {
      subject: (name: string) => `New message from ${name}`,
      preview: "You have a new message about your booking.",
      heading: "New message",
      body: (name: string, code: string) => `${name} sent you a message about booking ${code}:`,
      button: "Reply",
    },
    eventReminder: {
      subject: (days: number) => (days <= 1 ? "It's tomorrow" : `${days} days to go`),
      preview: "A reminder about your event.",
      heading: (days: number) => (days <= 1 ? "It's tomorrow!" : `${days} days to go`),
      body: (name: string, event: string, date: string, agency: string) =>
        `Hi ${name}, your ${event} on ${date} is coming up. Check the details and your wishes (playlist, key moments) so ${agency} can prepare everything.`,
      button: "View your event",
    },
    gigReminder: {
      subject: (date: string) => `Gig on ${date}`,
      preview: "A reminder about your gig.",
      heading: "Your gig is coming up",
      body: (name: string, event: string, date: string, venue: string) => `Hi ${name}, you're playing a ${event} on ${date}${venue ? ` at ${venue}` : ""}. Check the brief for times, playlist and wishes.`,
      button: "Open brief",
    },
    quoteExpiring: {
      subject: (agency: string) => `Your quote from ${agency} expires soon`,
      preview: "Your quote is only valid a little longer.",
      heading: "Your quote expires soon",
      body: (name: string, agency: string, until: string) => `Hi ${name}, the quote from ${agency} is valid until ${until}. Accept it in time to book your date.`,
      button: "View quote",
    },
    balanceDue: {
      subject: (amount: string) => `Reminder: ${amount} still to pay`,
      preview: "The balance for your event is open.",
      heading: "Balance due",
      body: (name: string, amount: string, date: string, agency: string) =>
        `Hi ${name}, ${amount} is still open with ${agency} for your event on ${date}. Please pay before the event so everything is settled.`,
      button: "View and pay",
    },
    ticketReply: {
      subject: (ref: string, subject: string) => `[${ref}] ${subject}`,
      preview: "Support answered your question.",
      heading: "Reply from support",
      body: (name: string, subject: string) => `Hi ${name}, we've answered your question "${subject}".`,
      button: "Read the reply",
    },
    contactMessage: {
      subject: (name: string) => `Contact form: ${name}`,
      preview: "A new message through the contact form.",
      heading: "Message from the website",
      body: (name: string, email: string, company: string) => `${name} (${email}${company ? `, ${company}` : ""}) wrote through the contact form:`,
    },
    agencyCreated: {
      subject: (agency: string) => `Your agency ${agency} is ready on StageDesk`,
      preview: "We've created a StageDesk account for your agency.",
      heading: "Welcome to StageDesk",
      body: (name: string, agency: string) =>
        `Hi ${name}, we've set up ${agency} for you on StageDesk. Sign in with your email address: we'll email you a code, no password needed. Your trial has started.`,
      button: "Sign in",
    },
    quoteSent: {
      subject: (agency: string) => `Your quote from ${agency}`,
      preview: "Your quote is ready.",
      heading: "Your quote is ready",
      body: (name: string, agency: string, total: string, until: string) =>
        `Hi ${name}, ${agency} has prepared a quote for ${total}. Accept it before ${until} to book your date.`,
      button: "View quote",
    },
  },
} as const;
