import { randomUUID } from "node:crypto";
import type { Block, PageContent } from "@stagedesk/core";
import type { PrismaClient } from "./generated/prisma/client";

const h = (text: string): Block => ({ type: "heading", level: 2, text });
const p = (text: string): Block => ({ type: "paragraph", text });
const ul = (...items: string[]): Block => ({ type: "list", ordered: false, items });

const REVIEW = "Starter template: have a lawyer review it and fill in the [bracketed] details before launch.";

interface Starter {
  slugNl: string;
  slugEn: string;
  kind: "standard" | "legal";
  legalKey: string | null;
  acceptance: "none" | "all" | "agencies";
  placement: string;
  position: number;
  content: PageContent;
}

const starters: Starter[] = [
  {
    slugNl: "algemene-voorwaarden",
    slugEn: "terms",
    kind: "legal",
    legalKey: "terms",
    acceptance: "all",
    placement: "footer_legal",
    position: 0,
    content: {
      nl: {
        title: "Algemene voorwaarden",
        seoTitle: "Algemene voorwaarden",
        seoDescription: "De voorwaarden voor het gebruik van StageDesk.",
        blocks: [
          h("1. Wie we zijn"),
          p("StageDesk wordt aangeboden door [bedrijfsnaam], [adres], ingeschreven bij de KvK onder nummer [KvK-nummer]."),
          h("2. Het account"),
          ul("Je geeft juiste gegevens op en houdt je wachtwoord geheim.", "Een bureau is verantwoordelijk voor wat zijn teamleden in StageDesk doen.", "We kunnen een account blokkeren bij misbruik of fraude."),
          h("3. Abonnementen"),
          p("Bureaus betalen een abonnement per maand of jaar volgens de prijzen op de [prijzenpagina](/pricing). Na de proefperiode loopt het abonnement door tot je het opzegt; opzeggen kan op elk moment tegen het einde van de lopende periode."),
          h("4. Betalingen van klanten"),
          p("Klanten betalen via Stripe. StageDesk verdeelt een betaling na het evenement tussen het bureau, de artiest en de platformkosten zoals afgesproken bij het accepteren van de offerte."),
          h("5. Aansprakelijkheid"),
          p("De afspraken over een optreden zijn tussen het bureau, de artiest en de klant. StageDesk is een hulpmiddel en geen partij bij die overeenkomst. [Beperking van aansprakelijkheid laten opstellen.]"),
          h("6. Wijzigingen"),
          p("Als we deze voorwaarden wijzigen, vragen we je de nieuwe versie te accepteren bij je volgende keer inloggen."),
        ],
      },
      en: {
        title: "Terms of service",
        seoTitle: "Terms of service",
        seoDescription: "The terms for using StageDesk.",
        blocks: [
          h("1. Who we are"),
          p("StageDesk is provided by [company name], [address], registered with the Dutch Chamber of Commerce under number [KvK number]."),
          h("2. Your account"),
          ul("You provide accurate details and keep your password secret.", "An agency is responsible for what its team members do in StageDesk.", "We may block an account in case of abuse or fraud."),
          h("3. Subscriptions"),
          p("Agencies pay a monthly or yearly subscription at the prices on the [pricing page](/pricing). After the trial the subscription continues until you cancel; you can cancel at any time, effective at the end of the current period."),
          h("4. Customer payments"),
          p("Customers pay through Stripe. After the event StageDesk splits a payment between the agency, the artist and the platform fee as agreed when the quote was accepted."),
          h("5. Liability"),
          p("The agreement about a performance is between the agency, the artist and the customer. StageDesk is a tool and not a party to it. [Have a limitation of liability drafted.]"),
          h("6. Changes"),
          p("When we change these terms, we ask you to accept the new version the next time you sign in."),
        ],
      },
    },
  },
  {
    slugNl: "privacy",
    slugEn: "privacy-policy",
    kind: "legal",
    legalKey: "privacy",
    acceptance: "none",
    placement: "footer_legal",
    position: 1,
    content: {
      nl: {
        title: "Privacyverklaring",
        seoTitle: "Privacyverklaring",
        seoDescription: "Welke gegevens StageDesk verwerkt, waarom, en welke rechten je hebt.",
        blocks: [
          p("[Bedrijfsnaam] is verantwoordelijk voor de verwerking van persoonsgegevens van bureaus, partners en bezoekers van deze website. Voor gegevens van klanten en artiesten van een bureau is het bureau verantwoordelijk en zijn wij verwerker."),
          h("Welke gegevens"),
          ul("Account: naam, e-mailadres, telefoonnummer, taal.", "Boekingen: evenementgegevens, offertes, berichten en betalingen.", "Betalingen: verwerkt door Stripe; wij bewaren geen kaartgegevens.", "Technisch: IP-adres en apparaatgegevens voor beveiliging en misbruikpreventie."),
          h("Waarom"),
          ul("Om de dienst te leveren (uitvoering van de overeenkomst).", "Om betalingen en facturen te verwerken (wettelijke plicht).", "Om misbruik te voorkomen (gerechtvaardigd belang)."),
          h("Bewaartermijnen"),
          p("We bewaren accountgegevens zolang je account bestaat. Facturen en betalingen bewaren we 7 jaar, zoals de wet vraagt."),
          h("Je rechten"),
          p("Je kunt je gegevens inzien, laten corrigeren of laten verwijderen, en bezwaar maken. Mail [privacy@stagedesk.pro](mailto:privacy@stagedesk.pro). Je kunt ook een klacht indienen bij de Autoriteit Persoonsgegevens."),
        ],
      },
      en: {
        title: "Privacy policy",
        seoTitle: "Privacy policy",
        seoDescription: "What data StageDesk processes, why, and your rights.",
        blocks: [
          p("[Company name] is the controller for personal data of agencies, partners and visitors to this website. For data of an agency's customers and artists, the agency is the controller and we are its processor."),
          h("What data"),
          ul("Account: name, email address, phone number, language.", "Bookings: event details, quotes, messages and payments.", "Payments: processed by Stripe; we don't store card details.", "Technical: IP address and device details for security and abuse prevention."),
          h("Why"),
          ul("To provide the service (performance of the contract).", "To process payments and invoices (legal obligation).", "To prevent abuse (legitimate interest)."),
          h("How long"),
          p("We keep account data for as long as your account exists. Invoices and payments are kept for 7 years, as Dutch law requires."),
          h("Your rights"),
          p("You can access, correct or delete your data, and object to processing. Email [privacy@stagedesk.pro](mailto:privacy@stagedesk.pro). You can also complain to the Dutch Data Protection Authority (Autoriteit Persoonsgegevens)."),
        ],
      },
    },
  },
  {
    slugNl: "cookies",
    slugEn: "cookie-policy",
    kind: "legal",
    legalKey: "cookies",
    acceptance: "none",
    placement: "footer_legal",
    position: 2,
    content: {
      nl: {
        title: "Cookieverklaring",
        seoTitle: "Cookieverklaring",
        seoDescription: "Welke cookies StageDesk gebruikt.",
        blocks: [
          p("StageDesk gebruikt alleen cookies die nodig zijn om de site te laten werken. We gebruiken geen tracking- of advertentiecookies."),
          { type: "table", header: ["Cookie", "Waarvoor", "Hoe lang"], rows: [["better-auth.session_token", "Ingelogd blijven", "7 dagen"], ["NEXT_LOCALE", "Je taalkeuze onthouden", "1 jaar"], ["sd_via", "Onthouden via welke partner je kwam", "60 dagen"]] },
        ],
      },
      en: {
        title: "Cookie policy",
        seoTitle: "Cookie policy",
        seoDescription: "Which cookies StageDesk uses.",
        blocks: [
          p("StageDesk only uses cookies needed for the site to work. We don't use tracking or advertising cookies."),
          { type: "table", header: ["Cookie", "Purpose", "Duration"], rows: [["better-auth.session_token", "Keeping you signed in", "7 days"], ["NEXT_LOCALE", "Remembering your language", "1 year"], ["sd_via", "Remembering which partner referred you", "60 days"]] },
        ],
      },
    },
  },
  {
    slugNl: "verwerkersovereenkomst",
    slugEn: "data-processing-agreement",
    kind: "legal",
    legalKey: "dpa",
    acceptance: "agencies",
    placement: "footer_legal",
    position: 3,
    content: {
      nl: {
        title: "Verwerkersovereenkomst",
        seoTitle: "Verwerkersovereenkomst",
        seoDescription: "De afspraken tussen het bureau (verwerkingsverantwoordelijke) en StageDesk (verwerker).",
        blocks: [
          p("Deze verwerkersovereenkomst hoort bij de algemene voorwaarden en geldt voor bureaus die gegevens van hun klanten en artiesten in StageDesk verwerken."),
          h("Afspraken"),
          ul(
            "StageDesk verwerkt persoonsgegevens alleen in opdracht van het bureau, om de dienst te leveren.",
            "Medewerkers van StageDesk hebben een geheimhoudingsplicht.",
            "We nemen passende beveiligingsmaatregelen, zoals versleutelde verbindingen en tweestapsverificatie.",
            "Subverwerkers: Stripe (betalingen), [hostingpartij] (hosting in de EU), [e-maildienst] (e-mail).",
            "Een datalek melden we binnen 48 uur na ontdekking aan het bureau.",
            "Na beëindiging verwijderen we de gegevens, behalve wat we wettelijk moeten bewaren.",
          ),
        ],
      },
      en: {
        title: "Data processing agreement",
        seoTitle: "Data processing agreement",
        seoDescription: "The agreement between the agency (controller) and StageDesk (processor).",
        blocks: [
          p("This data processing agreement is part of the terms of service and applies to agencies that process data of their customers and artists in StageDesk."),
          h("What we agree"),
          ul(
            "StageDesk processes personal data only on the agency's instructions, to provide the service.",
            "StageDesk staff are bound by confidentiality.",
            "We take appropriate security measures, such as encrypted connections and two-factor sign-in.",
            "Sub-processors: Stripe (payments), [hosting provider] (hosting in the EU), [email provider] (email).",
            "We report a data breach to the agency within 48 hours of discovering it.",
            "When the agreement ends we delete the data, except what we must keep by law.",
          ),
        ],
      },
    },
  },
];

/** Starter pages, published once. Safe to run again: existing pages are left alone. */
export async function seedPages(prisma: PrismaClient) {
  for (const s of starters) {
    if (await prisma.page.findFirst({ where: { OR: [{ slugNl: s.slugNl }, { slugEn: s.slugEn }] }, select: { id: true } })) continue;
    const pageId = randomUUID();
    const versionId = randomUUID();
    await prisma.page.create({
      data: { id: pageId, slugNl: s.slugNl, slugEn: s.slugEn, kind: s.kind, legalKey: s.legalKey, acceptance: s.acceptance, placement: s.placement, position: s.position },
    });
    await prisma.pageVersion.create({
      data: { id: versionId, pageId, number: 1, content: s.content as object, note: s.kind === "legal" ? REVIEW : "Starter page", publishedAt: new Date() },
    });
    await prisma.page.update({ where: { id: pageId }, data: { status: "published", publishedVersionId: versionId } });
    console.log(`  created  page ${s.slugEn}`);
  }
}
