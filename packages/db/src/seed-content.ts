import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { ContentKind } from "@stagedesk/core";
import type { PrismaClient } from "./generated/prisma/client";

/**
 * Starter blog posts, help articles and changelog for the website. Bodies are
 * Markdown files in packages/db/content. Only adds what's missing, so edits
 * made in the admin panel are never overwritten.
 */
const dir = new URL("../content/", import.meta.url);
const read = (path: string) => {
  const url = new URL(path, dir);
  return existsSync(url) ? readFileSync(url, "utf8").trim() : null;
};

interface Category {
  slug: string;
  nl: string;
  en: string;
  descriptionNl: string;
  descriptionEn: string;
}

const categories: Record<"blog" | "help", Category[]> = {
  blog: [
    { slug: "gidsen", nl: "Gidsen", en: "Guides", descriptionNl: "Praktische uitleg voor boekingsbureaus.", descriptionEn: "Practical guides for booking agencies." },
    { slug: "ondernemen", nl: "Ondernemen", en: "Running an agency", descriptionNl: "Prijzen, planning en groei.", descriptionEn: "Pricing, planning and growth." },
    { slug: "product", nl: "Product", en: "Product", descriptionNl: "Nieuw in StageDesk.", descriptionEn: "New in StageDesk." },
  ],
  help: [
    { slug: "aan-de-slag", nl: "Aan de slag", en: "Getting started", descriptionNl: "Je bureau inrichten en je eerste boeking.", descriptionEn: "Setting up your agency and your first booking." },
    { slug: "boekingen", nl: "Boekingen", en: "Bookings", descriptionNl: "Aanvragen, offertes, agenda en berichten.", descriptionEn: "Inquiries, quotes, calendar and messages." },
    { slug: "betalingen", nl: "Betalingen", en: "Payments", descriptionNl: "Online en handmatig betalen, uitbetalingen.", descriptionEn: "Online and manual payments, payouts." },
    { slug: "artiesten", nl: "Artiesten", en: "Artists", descriptionNl: "Artiesten uitnodigen en de artiestenapp.", descriptionEn: "Inviting artists and the artist app." },
    { slug: "website", nl: "Website", en: "Website", descriptionNl: "Je eigen website en domein.", descriptionEn: "Your own website and domain." },
    { slug: "account", nl: "Account en abonnement", en: "Account and subscription", descriptionNl: "Inloggen, team en abonnement.", descriptionEn: "Signing in, team and subscription." },
  ],
};

interface Starter {
  kind: ContentKind;
  slug: string;
  category: string | null;
  date: string;
  featured?: boolean;
  cover?: string;
  nl: { title: string; excerpt: string };
  en: { title: string; excerpt: string };
}

const blog = (s: Omit<Starter, "kind">): Starter => ({ kind: "blog", ...s });
const help = (slug: string, category: string, nl: Starter["nl"], en: Starter["en"]): Starter => ({ kind: "help", slug, category, date: "2026-10-20", nl, en });

const starters: Starter[] = [
  blog({
    slug: "eigen-website-voor-je-bureau",
    category: "gidsen",
    date: "2026-10-23",
    featured: true,
    cover: "/content/covers/eigen-website-voor-je-bureau.webp",
    nl: { title: "Wat er op de website van je boekingsbureau moet staan", excerpt: "Klanten beslissen in een minuut of ze verder kijken. Zes dingen die een bureausite aanvragen oplevert." },
    en: { title: "What your booking agency's website needs", excerpt: "Customers decide within a minute whether to keep looking. Six things that make an agency site bring in inquiries." },
  }),
  blog({
    slug: "aanbetaling-en-uitbetaling",
    category: "gidsen",
    date: "2026-10-21",
    cover: "/content/covers/aanbetaling-en-uitbetaling.webp",
    nl: { title: "Aanbetaling vragen zonder gedoe", excerpt: "Waarom een aanbetaling je planning beschermt, hoeveel je vraagt en hoe het geld bij jou en je artiest komt." },
    en: { title: "Taking deposits without the hassle", excerpt: "Why a deposit protects your schedule, how much to ask, and how the money reaches you and your artist." },
  }),
  blog({
    slug: "bruiloftsseizoen-plannen",
    category: "ondernemen",
    date: "2026-10-18",
    cover: "/content/covers/bruiloftsseizoen-plannen.webp",
    nl: { title: "Het bruiloftsseizoen plannen zonder dubbele boekingen", excerpt: "Populaire zaterdagen, opties die verlopen en artiesten die op tijd hun beschikbaarheid doorgeven." },
    en: { title: "Planning wedding season without double bookings", excerpt: "Popular Saturdays, options that expire and artists who share their availability in time." },
  }),
  blog({
    slug: "overboekingen-bijhouden",
    category: "ondernemen",
    date: "2026-10-16",
    cover: "/content/covers/overboekingen-bijhouden.webp",
    nl: { title: "Overboekingen bijhouden zonder achter klanten aan te zitten", excerpt: "Eén kenmerk per boeking, klanten die zelf melden dat ze betaald hebben, en herinneringen op tijd." },
    en: { title: "Tracking bank transfers without chasing customers", excerpt: "One reference per booking, customers who report their own payments, and reminders in time." },
  }),
  blog({
    slug: "offertes-die-worden-geaccepteerd",
    category: "gidsen",
    date: "2026-10-14",
    cover: "/content/covers/offertes-die-worden-geaccepteerd.webp",
    nl: { title: "Zo schrijf je een offerte die wordt geaccepteerd", excerpt: "Vijf dingen die een DJ- of bandofferte duidelijk maken, en wat je beter weglaat." },
    en: { title: "How to write a quote that gets accepted", excerpt: "Five things that make a DJ or band quote clear, and what to leave out." },
  }),

  help("eerste-boeking", "aan-de-slag", { title: "Je eerste boeking, stap voor stap", excerpt: "Van aanvraag via offerte en artiest tot betaling en uitbetaling." }, { title: "Your first booking, step by step", excerpt: "From inquiry through quote and artist to payment and payout." }),
  help("je-bureau-instellen", "aan-de-slag", { title: "Je bureau instellen", excerpt: "Bureaugegevens, diensten, je team en je boekingspagina: de eerste stappen." }, { title: "Setting up your agency", excerpt: "Agency details, services, your team and your booking page: the first steps." }),
  help("boekingspagina-en-formulier", "boekingen", { title: "Je boekingspagina en het formulier op je website", excerpt: "Aanvragen ontvangen via je eigen pagina of via het formulier op je website." }, { title: "Your booking page and the form on your website", excerpt: "Receive inquiries on your own page or with the form on your website." }),
  help("offerte-maken", "boekingen", { title: "Een offerte maken en versturen", excerpt: "Regels uit je diensten, btw, aanbetaling en geldigheid." }, { title: "Creating and sending a quote", excerpt: "Lines from your services, VAT, deposit and validity." }),
  help("agenda-en-beschikbaarheid", "boekingen", { title: "De agenda en beschikbaarheid van artiesten", excerpt: "Al je evenementen per maand, en dubbele boekingen voorkomen." }, { title: "The calendar and artist availability", excerpt: "All your events per month, and avoiding double bookings." }),
  help("berichten-per-boeking", "boekingen", { title: "Berichten met klant en artiest", excerpt: "Elke boeking heeft een eigen gesprek, met e-mail voor wie niet inlogt." }, { title: "Messages with customer and artist", excerpt: "Every booking has its own conversation, with email for those who don't sign in." }),
  help("het-klantportaal", "boekingen", { title: "Wat je klant ziet in het klantportaal", excerpt: "Offerte, betalingen, artiest en berichten op één plek, zonder account." }, { title: "What your customer sees in the customer portal", excerpt: "Quote, payments, artist and messages in one place, without an account." }),
  help("online-betalingen", "betalingen", { title: "Online betalingen en uitbetalingen", excerpt: "Stripe koppelen, hoe klanten betalen en wanneer het geld bij jou en je artiest is." }, { title: "Online payments and payouts", excerpt: "Connecting Stripe, how customers pay, and when the money reaches you and your artist." }),
  help("handmatige-betalingen", "betalingen", { title: "Overboekingen en contante betalingen bevestigen", excerpt: "Betaalmethoden instellen, meldingen van klanten en ontvangst bevestigen." }, { title: "Confirming bank transfers and cash payments", excerpt: "Setting up payment methods, customer reports and confirming receipt." }),
  help("artiesten-uitnodigen-en-delen", "artiesten", { title: "Artiesten uitnodigen en delen met andere bureaus", excerpt: "Een artiest toevoegen, uitnodigen voor de app en delen met een partnerbureau." }, { title: "Inviting artists and sharing them with other agencies", excerpt: "Add an artist, invite them to the app and share them with a partner agency." }),
  help("de-artiestenapp", "artiesten", { title: "De artiestenapp", excerpt: "Optredens accepteren, beschikbaarheid doorgeven en verdiensten bekijken." }, { title: "The artist app", excerpt: "Accepting gigs, sharing availability and viewing earnings." }),
  help("je-website-bouwen", "website", { title: "Je eigen website bouwen", excerpt: "Secties slepen, kleuren kiezen en publiceren, met aanvragen direct in StageDesk." }, { title: "Building your own website", excerpt: "Drag sections, choose colours and publish, with inquiries straight into StageDesk." }),
  help("eigen-domein-koppelen", "website", { title: "Een eigen domein koppelen", excerpt: "Je website op www.jouwbureau.nl, met DNS-instellingen en certificaat." }, { title: "Connecting your own domain", excerpt: "Your website on www.youragency.com, with DNS settings and certificate." }),
  help("inloggen-en-beveiliging", "account", { title: "Inloggen met een code en tweestapsverificatie", excerpt: "Inloggen zonder wachtwoord, je wachtwoord herstellen en je account extra beveiligen." }, { title: "Signing in with a code and two-factor authentication", excerpt: "Signing in without a password, resetting your password and securing your account." }),
  help("team-en-rollen", "account", { title: "Je team en rollen", excerpt: "Teamleden uitnodigen, rollen kiezen en toegang intrekken." }, { title: "Your team and roles", excerpt: "Inviting team members, choosing roles and removing access." }),
  help("abonnement-beheren", "account", { title: "Je abonnement beheren", excerpt: "Proefperiode, wisselen van pakket, facturen en opzeggen." }, { title: "Managing your subscription", excerpt: "Trial, switching plans, invoices and cancelling." }),
];

/** Splits a changelog file into releases, one per level-2 heading. */
function releases(markdown: string) {
  return markdown
    .split(/^## /m)
    .filter((s) => s.trim())
    .map((s) => {
      const [title = "", ...rest] = s.split("\n");
      return { title: title.trim(), body: rest.join("\n").trim() };
    });
}

export async function seedContent(prisma: PrismaClient) {
  const categoryIds = new Map<string, string>();
  for (const kind of ["blog", "help"] as const) {
    for (const [position, c] of categories[kind].entries()) {
      const existing = await prisma.contentCategory.findUnique({ where: { kind_slug: { kind, slug: c.slug } } });
      const row =
        existing ??
        (await prisma.contentCategory.create({
          data: { id: randomUUID(), kind, slug: c.slug, nameNl: c.nl, nameEn: c.en, descriptionNl: c.descriptionNl, descriptionEn: c.descriptionEn, position },
        }));
      categoryIds.set(`${kind}:${c.slug}`, row.id);
    }
  }

  let created = 0;
  for (const [position, s] of starters.entries()) {
    if (await prisma.contentArticle.findUnique({ where: { kind_slug: { kind: s.kind, slug: s.slug } } })) continue;
    const bodyNl = read(`${s.kind}/${s.slug}.nl.md`);
    const bodyEn = read(`${s.kind}/${s.slug}.en.md`);
    if (!bodyNl) continue;
    await prisma.contentArticle.create({
      data: {
        id: randomUUID(),
        kind: s.kind,
        slug: s.slug,
        categoryId: s.category ? (categoryIds.get(`${s.kind}:${s.category}`) ?? null) : null,
        status: "published",
        featured: s.featured ?? false,
        publishedAt: new Date(`${s.date}T09:00:00Z`),
        coverImage: s.cover ?? null,
        authorName: s.kind === "blog" ? "Team StageDesk" : null,
        position,
        nl: { title: s.nl.title, excerpt: s.nl.excerpt, body: bodyNl, seoTitle: "", seoDescription: "" },
        ...(bodyEn ? { en: { title: s.en.title, excerpt: s.en.excerpt, body: bodyEn, seoTitle: "", seoDescription: "" } } : {}),
      },
    });
    created++;
  }

  // The changelog: one entry per release, newest first in the file.
  if ((await prisma.contentArticle.count({ where: { kind: "changelog" } })) === 0) {
    const nl = releases(read("changelog/nl.md") ?? "");
    const en = releases(read("changelog/en.md") ?? "");
    for (const [i, r] of nl.entries()) {
      const e = en[i];
      await prisma.contentArticle.create({
        data: {
          id: randomUUID(),
          kind: "changelog",
          slug: `release-${nl.length - i}`,
          status: "published",
          // Older releases a day apart, so the order holds.
          publishedAt: new Date(Date.UTC(2026, 9, 22 - i, 9)),
          nl: { title: r.title, excerpt: "", body: r.body, seoTitle: "", seoDescription: "" },
          ...(e ? { en: { title: e.title, excerpt: "", body: e.body, seoTitle: "", seoDescription: "" } } : {}),
        },
      });
      created++;
    }
  }
  console.log(`  content  ${created} added`);
}
