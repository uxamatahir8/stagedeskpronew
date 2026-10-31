import { randomUUID } from "node:crypto";
import { type Section, type SitePageContent, type SiteTheme, siteThemeSchema } from "@stagedesk/core";
import { prisma } from "./client";
import { publishSite } from "./sites";

const id = (type: string) => `${type}-${randomUUID().slice(0, 6)}`;
const page = (title: string, seoTitle: string, seoDescription: string, sections: Section[]): SitePageContent => ({ nl: { title, seoTitle, seoDescription, sections }, en: null });

/**
 * A finished demo website for the demo agency: four pages, the agency's live
 * artists, packages and reviews, and the booking form. Replaces whatever the
 * site had and publishes it.
 */
export async function seedShowcaseSite(organizationId: string) {
  const theme: SiteTheme = siteThemeSchema.parse({ primary: "#3b1748", accent: "#e0457b", font: "modern", radius: "round", mode: "dark" });
  const home = page("Home", "Feestband Utrecht · DJ's en live-acts voor bruiloften en feesten", "Feestband Utrecht verzorgt al ruim tien jaar de muziek op bruiloften, bedrijfsfeesten en verjaardagen in Midden-Nederland. Vraag vrijblijvend een offerte aan.", [
    { id: id("hero"), type: "hero", background: "brand", title: "Muziek die van jullie feest een avond maakt om nooit te vergeten", subtitle: "Dj's, saxofonisten en live-acts voor bruiloften, bedrijfsfeesten en verjaardagen in Utrecht en heel Midden-Nederland.", image: "", align: "center", ctaLabel: "Vraag een offerte aan", ctaTarget: "booking", ctaUrl: "" },
    {
      id: id("highlights"),
      type: "highlights",
      background: "default",
      heading: "Waarom kiezen voor Feestband Utrecht",
      items: [
        { icon: "music", title: "Muziek op maat", body: "We maken samen jullie playlist en lezen de zaal: van ceremonie tot laatste nummer." },
        { icon: "star", title: "Ruim 600 feesten", body: "Ervaren dj's en muzikanten die weten wanneer de dansvloer vol moet." },
        { icon: "shield", title: "Zorgeloos geregeld", body: "Heldere offerte, vaste afspraken en een draaiboek dat iedereen kent." },
      ],
    },
    { id: id("artists"), type: "artists", background: "muted", heading: "Onze artiesten", intro: "Elk feest verdient de juiste artiest. Maak kennis met ons team.", max: 6 },
    { id: id("packages"), type: "packages", background: "default", heading: "Pakketten en prijzen", intro: "Alle prijzen zijn inclusief btw. Je offerte stellen we samen op jullie wensen af.", showPrices: true },
    { id: id("reviews"), type: "reviews", background: "muted", heading: "Wat bruidsparen en bedrijven zeggen", max: 3 },
    {
      id: id("faq"),
      type: "faq",
      background: "default",
      heading: "Veelgestelde vragen",
      items: [
        { q: "Hoe ver van tevoren moeten we boeken?", a: "Voor bruiloften in mei tot september raden we 9 tot 12 maanden aan. Voor bedrijfsfeesten is 2 tot 3 maanden meestal genoeg." },
        { q: "Nemen jullie geluid en licht mee?", a: "Ja. Elke boeking krijgt een geluid- en lichtset die past bij de ruimte en het aantal gasten." },
        { q: "Kunnen we de muziek zelf kiezen?", a: "Zeker. Je deelt je playlist en wensen in je persoonlijke omgeving, en je dj stemt de avond daarop af." },
      ],
    },
    { id: id("booking"), type: "booking", background: "muted", heading: "Vraag een offerte aan", intro: "Vertel ons over jullie feest. Je ontvangt binnen twee werkdagen een offerte." },
  ]);
  const weddings = page("Bruiloften", "Bruiloft-DJ in Utrecht · Feestband Utrecht", "Een dj voor jullie bruiloft: ceremonie, diner en feest, met jullie eigen playlist. Vraag een offerte aan bij Feestband Utrecht.", [
    { id: id("hero"), type: "hero", background: "brand", title: "Jullie bruiloft, van ja-woord tot laatste dans", subtitle: "Ceremoniemuziek, een sfeervol diner en een volle dansvloer: één team regelt het allemaal.", image: "", align: "left", ctaLabel: "Bespreek jullie dag", ctaTarget: "booking", ctaUrl: "" },
    { id: id("text"), type: "text", background: "default", heading: "Zo verloopt het", body: "We beginnen met een kennismaking, online of bij jullie op de bank. Daarna krijgen jullie een **offerte op maat** die je online accepteert.\n\nIn jullie persoonlijke omgeving delen jullie de playlist, de openingsdans en de momenten die niet mogen missen. Een week voor de bruiloft lopen we samen het draaiboek door." },
    {
      id: id("highlights"),
      type: "highlights",
      background: "muted",
      heading: "Alles voor jullie dag",
      items: [
        { icon: "heart", title: "Ceremonie", body: "Live sax of akoestische set bij het ja-woord." },
        { icon: "sparkles", title: "Openingsdans", body: "Precies het juiste nummer, perfect getimed." },
        { icon: "mic", title: "MC op verzoek", body: "Een vaste stem die het programma begeleidt." },
      ],
    },
    { id: id("cta"), type: "cta", background: "brand", heading: "Nog niet zeker of jullie datum vrij is?", body: "Vraag vrijblijvend een offerte aan; we laten het binnen twee werkdagen weten.", ctaLabel: "Offerte aanvragen", ctaTarget: "booking", ctaUrl: "" },
  ]);
  const corporate = page("Bedrijfsfeesten", "Bedrijfsfeest DJ en live-acts · Feestband Utrecht", "Muziek voor personeelsfeesten, jubilea en borrels. Feestband Utrecht verzorgt dj's en live-acts voor bedrijven in Midden-Nederland.", [
    { id: id("hero"), type: "hero", background: "brand", title: "Een bedrijfsfeest waar ze het nog maanden over hebben", subtitle: "Van borrel tot personeelsfeest: muziek die past bij jullie mensen en jullie merk.", image: "", align: "left", ctaLabel: "Vraag een offerte aan", ctaTarget: "booking", ctaUrl: "" },
    { id: id("packages"), type: "packages", background: "default", heading: "Wat we meebrengen", intro: "Inclusief btw; voor grote evenementen maken we een voorstel op maat.", showPrices: true },
    { id: id("reviews"), type: "reviews", background: "muted", heading: "Ervaringen van bedrijven", max: 3 },
  ]);
  const about = page("Over ons", "Over Feestband Utrecht", "Feestband Utrecht is een team van dj's en muzikanten uit Utrecht. Al ruim tien jaar de muziek op bruiloften en bedrijfsfeesten.", [
    { id: id("text"), type: "text", background: "default", heading: "Over Feestband Utrecht", body: "Wat begon met één draaitafel op een vriendenbruiloft, is uitgegroeid tot een team van dj's en muzikanten dat elk weekend ergens in Midden-Nederland de dansvloer vult.\n\nWe geloven dat goede muziek begint met luisteren: naar jullie wensen, en naar de zaal. Daarom heeft elk feest één vaste contactpersoon en een artiest die jullie avond vooraf écht kent." },
    { id: id("artists"), type: "artists", background: "muted", heading: "Het team", intro: "", max: 6 },
    { id: id("contact"), type: "contact", background: "default", heading: "Contact", intro: "Bel, mail of kom langs in Utrecht." },
  ]);

  await prisma.$transaction([
    prisma.agencySitePage.deleteMany({ where: { organizationId } }),
    prisma.agencySite.upsert({ where: { organizationId }, update: { theme, englishEnabled: false }, create: { organizationId, theme } }),
    ...[
      { slug: "", draft: home },
      { slug: "bruiloften", draft: weddings },
      { slug: "bedrijfsfeesten", draft: corporate },
      { slug: "over-ons", draft: about },
    ].map((p, position) => prisma.agencySitePage.create({ data: { id: randomUUID(), organizationId, slug: p.slug, position, inNav: true, draft: p.draft } })),
  ]);
  await publishSite(organizationId);
}
