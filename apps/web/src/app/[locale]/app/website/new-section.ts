import type { Section, SectionType } from "@stagedesk/core";

const id = (type: string) => `${type}-${Math.random().toString(36).slice(2, 8)}`;

/** Starter content for a section the agency adds, in the language being edited. */
export function newSection(type: SectionType, lang: "nl" | "en"): Section {
  const nl = lang === "nl";
  const base = { id: id(type), background: "default" as const };
  switch (type) {
    case "hero":
      return { ...base, type, background: "brand", title: nl ? "Muziek voor jullie mooiste dag" : "Music for your best day", subtitle: nl ? "Dj's en live-acts voor bruiloften, bedrijfsfeesten en verjaardagen." : "DJs and live acts for weddings, corporate events and birthdays.", image: "", align: "center", ctaLabel: nl ? "Vraag een offerte aan" : "Request a quote", ctaTarget: "booking", ctaUrl: "" };
    case "text":
      return { ...base, type, heading: nl ? "Over ons" : "About us", body: nl ? "Vertel hier wie jullie zijn, wat jullie doen en wat jullie anders maakt.\n\nGebruik **vet**, *cursief* of een [link](https://voorbeeld.nl)." : "Tell visitors who you are, what you do and what makes you different.\n\nUse **bold**, *italic* or a [link](https://example.com)." };
    case "highlights":
      return {
        ...base,
        type,
        heading: nl ? "Waarom kiezen voor ons" : "Why choose us",
        items: [
          { icon: "music", title: nl ? "Muziek op maat" : "Music to match", body: nl ? "Afgestemd op jullie wensen." : "Tuned to your wishes." },
          { icon: "star", title: nl ? "Ervaren artiesten" : "Experienced artists", body: nl ? "Honderden feesten op hun naam." : "Hundreds of parties played." },
          { icon: "shield", title: nl ? "Zorgeloos geregeld" : "No worries", body: nl ? "Heldere afspraken vooraf." : "Clear agreements upfront." },
        ],
      };
    case "artists":
      return { ...base, type, background: "muted", heading: nl ? "Onze artiesten" : "Our artists", intro: "", max: 6 };
    case "packages":
      return { ...base, type, heading: nl ? "Pakketten en prijzen" : "Packages and prices", intro: "", showPrices: true };
    case "reviews":
      return { ...base, type, heading: nl ? "Wat klanten zeggen" : "What customers say", max: 3 };
    case "gallery":
      return { ...base, type, heading: nl ? "Sfeerbeelden" : "Gallery", images: [{ url: "/brand/mark.png", alt: "" }] };
    case "video":
      return { ...base, type, heading: nl ? "Bekijk ons in actie" : "See us in action", url: "" };
    case "faq":
      return { ...base, type, heading: nl ? "Veelgestelde vragen" : "Frequently asked questions", items: [{ q: nl ? "Hoe ver van tevoren moeten we boeken?" : "How far ahead should we book?", a: nl ? "Voor bruiloften in het hoogseizoen raden we 6 tot 12 maanden aan." : "For summer weddings we recommend 6 to 12 months." }] };
    case "cta":
      return { ...base, type, background: "brand", heading: nl ? "Klaar voor een onvergetelijk feest?" : "Ready for an unforgettable party?", body: nl ? "Vraag vrijblijvend een offerte aan." : "Request a quote, no strings attached.", ctaLabel: nl ? "Offerte aanvragen" : "Request a quote", ctaTarget: "booking", ctaUrl: "" };
    case "booking":
      return { ...base, type, background: "muted", heading: nl ? "Vraag een offerte aan" : "Request a quote", intro: nl ? "Vertel ons over je feest; je hoort snel van ons." : "Tell us about your event; we'll be in touch soon." };
    case "contact":
      return { ...base, type, heading: nl ? "Contact" : "Contact", intro: nl ? "Bel, mail of kom langs." : "Call, email or drop by." };
  }
}

/** A copy with fresh ids, e.g. when duplicating a section. */
export function cloneSection(section: Section): Section {
  return { ...structuredClone(section), id: id(section.type) };
}
