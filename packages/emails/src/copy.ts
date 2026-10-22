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
