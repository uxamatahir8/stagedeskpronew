import { Archivo, Cormorant_Garamond, Fredoka, Inter, Nunito, Oswald, Playfair_Display, Space_Grotesk } from "next/font/google";
import type { SiteTheme } from "@stagedesk/core";

// The type styles an agency can pick. Each sets --site-font, which the site uses for all text.
// (next/font needs every font loaded by its own top-level call, hence the repetition.)
const modern = Inter({ subsets: ["latin"], variable: "--site-font", display: "swap" });
const classic = Playfair_Display({ subsets: ["latin"], variable: "--site-font", display: "swap" });
const rounded = Nunito({ subsets: ["latin"], variable: "--site-font", display: "swap" });
const bold = Archivo({ subsets: ["latin"], variable: "--site-font", display: "swap" });
const elegant = Cormorant_Garamond({ subsets: ["latin"], variable: "--site-font", display: "swap" });
const geometric = Space_Grotesk({ subsets: ["latin"], variable: "--site-font", display: "swap" });
const condensed = Oswald({ subsets: ["latin"], variable: "--site-font", display: "swap" });
const playful = Fredoka({ subsets: ["latin"], variable: "--site-font", display: "swap" });

export const siteFontClass: Record<SiteTheme["font"], string> = {
  modern: modern.variable,
  classic: classic.variable,
  rounded: rounded.variable,
  bold: bold.variable,
  elegant: elegant.variable,
  geometric: geometric.variable,
  condensed: condensed.variable,
  playful: playful.variable,
};

// The same fonts for headings only (--site-heading-font), when the theme picks a separate heading font.
const hModern = Inter({ subsets: ["latin"], variable: "--site-heading-font", display: "swap" });
const hClassic = Playfair_Display({ subsets: ["latin"], variable: "--site-heading-font", display: "swap" });
const hRounded = Nunito({ subsets: ["latin"], variable: "--site-heading-font", display: "swap" });
const hBold = Archivo({ subsets: ["latin"], variable: "--site-heading-font", display: "swap" });
const hElegant = Cormorant_Garamond({ subsets: ["latin"], variable: "--site-heading-font", display: "swap" });
const hGeometric = Space_Grotesk({ subsets: ["latin"], variable: "--site-heading-font", display: "swap" });
const hCondensed = Oswald({ subsets: ["latin"], variable: "--site-heading-font", display: "swap" });
const hPlayful = Fredoka({ subsets: ["latin"], variable: "--site-heading-font", display: "swap" });

export const siteHeadingFontClass: Record<SiteTheme["font"], string> = {
  modern: hModern.variable,
  classic: hClassic.variable,
  rounded: hRounded.variable,
  bold: hBold.variable,
  elegant: hElegant.variable,
  geometric: hGeometric.variable,
  condensed: hCondensed.variable,
  playful: hPlayful.variable,
};
