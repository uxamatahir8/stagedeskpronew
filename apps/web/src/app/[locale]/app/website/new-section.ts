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
    case "cards":
      return {
        ...base,
        type,
        heading: nl ? "Voor elk feest de juiste act" : "The right act for every party",
        intro: nl ? "Kies wat bij jullie avond past." : "Pick what suits your night.",
        layout: "grid",
        columns: 3,
        items: [
          { icon: "heart", image: "", title: nl ? "Bruiloften" : "Weddings", body: nl ? "Van ceremonie tot laatste dans, met muziek die bij jullie past." : "From ceremony to last dance, with music that fits you.", linkLabel: "", linkUrl: "" },
          { icon: "briefcase", image: "", title: nl ? "Bedrijfsfeesten" : "Corporate events", body: nl ? "Een strak programma en een volle dansvloer." : "A tight programme and a full dance floor.", linkLabel: "", linkUrl: "" },
          { icon: "party", image: "", title: nl ? "Verjaardagen" : "Birthdays", body: nl ? "Van intiem tot groots: wij maken er een feest van." : "Small or big: we make it a party.", linkLabel: "", linkUrl: "" },
        ],
      };
    case "stats":
      return {
        ...base,
        type,
        background: "brand",
        heading: "",
        items: [
          { value: "500+", label: nl ? "feesten" : "parties", icon: "party" },
          { value: "4.9", label: nl ? "gemiddelde beoordeling" : "average rating", icon: "star" },
          { value: "15", label: nl ? "jaar ervaring" : "years of experience", icon: "award" },
        ],
      };
    case "steps":
      return {
        ...base,
        type,
        heading: nl ? "Zo werkt het" : "How it works",
        intro: "",
        layout: "horizontal",
        items: [
          { title: nl ? "Vertel over je feest" : "Tell us about your party", body: nl ? "Vul het aanvraagformulier in." : "Fill in the request form.", icon: "" },
          { title: nl ? "Ontvang een offerte" : "Get a quote", body: nl ? "Op maat, binnen een paar dagen." : "Tailored, within a few days.", icon: "" },
          { title: nl ? "Feest!" : "Party!", body: nl ? "Wij zorgen voor de rest." : "We take care of the rest.", icon: "" },
        ],
      };
    case "split":
      return {
        ...base,
        type,
        heading: nl ? "Muziek met gevoel voor de zaal" : "Music with a feel for the room",
        body: nl ? "Onze artiesten lezen de zaal en spelen precies wat jullie gasten op de dansvloer houdt." : "Our artists read the room and play exactly what keeps your guests on the dance floor.",
        image: "",
        imageSide: "right",
        items: [{ text: nl ? "Persoonlijk kennismakingsgesprek" : "Personal intake meeting" }, { text: nl ? "Professioneel geluid en licht" : "Professional sound and light" }, { text: nl ? "Vaste prijs, geen verrassingen" : "Fixed price, no surprises" }],
        ctaLabel: nl ? "Vraag een offerte aan" : "Request a quote",
        ctaTarget: "booking",
        ctaUrl: "",
      };
    case "testimonials":
      return {
        ...base,
        type,
        background: "muted",
        heading: nl ? "Wat anderen zeggen" : "What others say",
        layout: "grid",
        items: [
          { quote: nl ? "De dansvloer was de hele avond vol. Precies wat we wilden!" : "The dance floor was packed all night. Exactly what we wanted!", author: "Lotte & Sem", role: nl ? "Bruiloft, juni" : "Wedding, June", image: "", rating: 5 },
          { quote: nl ? "Professioneel, op tijd en ontzettend gezellig." : "Professional, on time and great fun.", author: "Mark", role: nl ? "Bedrijfsfeest" : "Corporate event", image: "", rating: 5 },
        ],
      };
    case "pricing":
      return {
        ...base,
        type,
        heading: nl ? "Pakketten" : "Packages",
        intro: nl ? "Alle prijzen inclusief btw." : "All prices include VAT.",
        items: [
          { name: "Basis", price: "€ 695", period: nl ? "per avond" : "per night", description: nl ? "Voor kleinere feesten." : "For smaller parties.", features: nl ? "4 uur dj\nGeluid tot 100 gasten" : "4 hours DJ\nSound up to 100 guests", highlighted: false, badge: "", ctaLabel: nl ? "Kies Basis" : "Choose Basic" },
          { name: "Compleet", price: "€ 995", period: nl ? "per avond" : "per night", description: nl ? "Ons populairste pakket." : "Our most popular package.", features: nl ? "6 uur dj\nGeluid en licht\nPersoonlijk gesprek" : "6 hours DJ\nSound and light\nPersonal meeting", highlighted: true, badge: nl ? "Populair" : "Popular", ctaLabel: nl ? "Kies Compleet" : "Choose Complete" },
          { name: "Premium", price: "€ 1.495", period: nl ? "per avond" : "per night", description: nl ? "Alles erop en eraan." : "The works.", features: nl ? "Dj + saxofonist\nLicht en effecten\nCeremoniemuziek" : "DJ + saxophonist\nLight and effects\nCeremony music", highlighted: false, badge: "", ctaLabel: nl ? "Kies Premium" : "Choose Premium" },
        ],
        ctaLabel: "",
        ctaTarget: "booking",
        ctaUrl: "",
      };
    case "logos":
      return { ...base, type, heading: nl ? "Zij gingen je voor" : "Trusted by", grayscale: true, images: [{ url: "/brand/mark.png", alt: "" }] };
    case "team":
      return {
        ...base,
        type,
        heading: nl ? "Ons team" : "Our team",
        intro: "",
        items: [
          { image: "", name: "Mark", role: nl ? "Eigenaar" : "Owner", bio: "" },
          { image: "", name: "Lisa", role: nl ? "Planning" : "Planning", bio: "" },
        ],
      };
    case "banner":
      return { ...base, type, background: "accent", text: nl ? "Nog een paar data vrij in het najaar!" : "A few autumn dates still available!", icon: "sparkles", ctaLabel: nl ? "Check je datum" : "Check your date", ctaTarget: "booking", ctaUrl: "" };
    case "divider":
      return { ...base, type, style: "line" };
  }
}

/** A copy with fresh ids, e.g. when duplicating a section. */
export function cloneSection(section: Section): Section {
  return { ...structuredClone(section), id: id(section.type) };
}
