import { Archivo, Inter, Nunito, Playfair_Display } from "next/font/google";
import type { SiteTheme } from "@stagedesk/core";

// The four type styles an agency can pick. Each sets --site-font, which the site uses for all text.
const modern = Inter({ subsets: ["latin"], variable: "--site-font", display: "swap" });
const classic = Playfair_Display({ subsets: ["latin"], variable: "--site-font", display: "swap" });
const rounded = Nunito({ subsets: ["latin"], variable: "--site-font", display: "swap" });
const bold = Archivo({ subsets: ["latin"], variable: "--site-font", display: "swap" });

export const siteFontClass: Record<SiteTheme["font"], string> = {
  modern: modern.variable,
  classic: classic.variable,
  rounded: rounded.variable,
  bold: bold.variable,
};
