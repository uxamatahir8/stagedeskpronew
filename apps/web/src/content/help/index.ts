import type { MDXContent } from "mdx/types";

/**
 * Help centre articles. Add one: write `articles/<slug>.nl.mdx` and
 * `articles/<slug>.en.mdx`, then add its entry here under a category.
 */
export const helpCategories = ["getting-started", "bookings", "payments", "artists", "account"] as const;
export type HelpCategory = (typeof helpCategories)[number];

export interface HelpArticle {
  slug: string;
  category: HelpCategory;
  nl: { title: string; description: string };
  en: { title: string; description: string };
}

export const articles: HelpArticle[] = [
  {
    slug: "je-bureau-instellen",
    category: "getting-started",
    nl: { title: "Je bureau instellen", description: "Bureaugegevens, diensten, je team en je boekingspagina: de eerste stappen." },
    en: { title: "Setting up your agency", description: "Agency details, services, your team and your booking page: the first steps." },
  },
  {
    slug: "boekingspagina-en-formulier",
    category: "bookings",
    nl: { title: "Je boekingspagina en het formulier op je website", description: "Aanvragen ontvangen via je eigen pagina of via het formulier op je website." },
    en: { title: "Your booking page and the form on your website", description: "Receive inquiries on your own page or with the form on your website." },
  },
  {
    slug: "offerte-maken",
    category: "bookings",
    nl: { title: "Een offerte maken en versturen", description: "Regels uit je diensten, btw, aanbetaling en geldigheid." },
    en: { title: "Creating and sending a quote", description: "Lines from your services, VAT, deposit and validity." },
  },
  {
    slug: "online-betalingen",
    category: "payments",
    nl: { title: "Online betalingen en uitbetalingen", description: "Stripe koppelen, hoe klanten betalen en wanneer het geld bij jou en je artiest is." },
    en: { title: "Online payments and payouts", description: "Connecting Stripe, how customers pay, and when the money reaches you and your artist." },
  },
  {
    slug: "artiesten-uitnodigen-en-delen",
    category: "artists",
    nl: { title: "Artiesten uitnodigen en delen met andere bureaus", description: "Een artiest toevoegen, uitnodigen voor de app en delen met een partnerbureau." },
    en: { title: "Inviting artists and sharing them with other agencies", description: "Add an artist, invite them to the app and share them with a partner agency." },
  },
  {
    slug: "inloggen-en-beveiliging",
    category: "account",
    nl: { title: "Inloggen met een code en tweestapsverificatie", description: "Inloggen zonder wachtwoord, je wachtwoord herstellen en je account extra beveiligen." },
    en: { title: "Signing in with a code and two-factor authentication", description: "Signing in without a password, resetting your password and securing your account." },
  },
];

export function findArticle(slug: string) {
  return articles.find((a) => a.slug === slug) ?? null;
}

export async function loadArticle(slug: string, locale: "nl" | "en"): Promise<MDXContent> {
  return (await import(`./articles/${slug}.${locale}.mdx`)).default;
}
