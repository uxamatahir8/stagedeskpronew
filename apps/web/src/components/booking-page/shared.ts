import type { BookingSectionKey } from "@stagedesk/core";

/** The booking form's anchor; older links and the embed script point here. */
export const FORM_ANCHOR = "aanvraag";

/** Lets the inquiry form pick the artist a visitor chose on the page. */
export const PREFER_ARTIST_EVENT = "stagedesk:prefer-artist";

/** A soft tint of the accent that works on light and dark backgrounds. */
export const accentTint = "bg-[color-mix(in_oklab,var(--bp-accent)_14%,var(--card))]";

/** The standard heading of each section (under `bookingPage`), used unless the agency writes its own. */
export const sectionHeadingKey = {
  intro: "about",
  artists: "ourArtists",
  reviews: "reviews",
  booking: "formTitle",
  faq: "faq",
  contact: "contact",
} as const satisfies Record<BookingSectionKey, string>;
