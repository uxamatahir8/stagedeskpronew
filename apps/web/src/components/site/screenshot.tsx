import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";

/**
 * Real screenshots of the app with demo data, framed by scripts outside the
 * app (browser window or phone) and stored per language in public/screens.
 */
export const screens = {
  dashboard: { kind: "desktop" },
  bookings: { kind: "desktop" },
  booking: { kind: "desktop" },
  calendar: { kind: "desktop" },
  payments: { kind: "desktop" },
  admin: { kind: "desktop" },
  "booking-page": { kind: "desktop" },
  artist: { kind: "phone" },
  customer: { kind: "phone" },
  "hero-collage": { kind: "collage" },
} as const;
export type ScreenKey = keyof typeof screens;

const sizes = { desktop: { width: 1600, height: 1052 }, phone: { width: 600, height: 1247 }, collage: { width: 2400, height: 1500 } } as const;

export async function Screenshot({ name, className, priority = false }: { name: ScreenKey; className?: string; priority?: boolean }) {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("screens")]);
  const { kind } = screens[name];
  const size = sizes[kind];
  return (
    <Image
      src={`/screens/${locale === "en" ? "en" : "nl"}/${name}.webp`}
      alt={t(`alt_${name.replace("-", "_") as "dashboard"}`)}
      width={size.width}
      height={size.height}
      priority={priority}
      sizes={kind === "phone" ? "(min-width: 1024px) 300px, 70vw" : "(min-width: 1280px) 1100px, 100vw"}
      className={cn(kind === "desktop" && "rounded-xl shadow-2xl shadow-primary/15", kind === "phone" && "drop-shadow-2xl", "h-auto w-full", className)}
    />
  );
}
