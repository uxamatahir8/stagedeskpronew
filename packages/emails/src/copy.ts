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
  },
} as const;
