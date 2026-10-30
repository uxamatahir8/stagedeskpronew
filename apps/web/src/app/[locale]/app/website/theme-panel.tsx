"use client";

import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { siteFonts, sitePresets, type SiteTheme } from "@stagedesk/core";
import { siteFontClass } from "@/components/sites/fonts";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

const pageSwatch = { light: "#ffffff", tinted: "#f5f0f6", dark: "#0b0b10" } as const;

/** The site's look: a ready-made theme to start from, then every setting by hand. */
export function ThemePanel({ theme, onChange }: { theme: SiteTheme; onChange: (next: Partial<SiteTheme>) => void }) {
  const t = useTranslations("websiteEditor");
  const same = (a: SiteTheme, b: SiteTheme) => (Object.keys(a) as (keyof SiteTheme)[]).every((k) => a[k] === b[k]);

  const select = <K extends keyof SiteTheme>(key: K, options: readonly SiteTheme[K][], label = t(`theme_${key}` as "theme_page")) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`th-${key}`}>{label}</Label>
      <NativeSelect id={`th-${key}`} value={String(theme[key])} onChange={(e) => onChange({ [key]: e.target.value } as Partial<SiteTheme>)} className="h-9 w-full min-w-0 rounded-md border bg-background px-3 text-sm">
        {options.map((o) => (
          <option key={String(o)} value={String(o)}>
            {t(`themeOpt_${key}_${String(o)}` as "themeOpt_page_light")}
          </option>
        ))}
      </NativeSelect>
    </div>
  );

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <p className="text-sm font-medium">{t("presets")}</p>
        <div className="grid grid-cols-2 gap-2">
          {sitePresets.map((preset) => {
            const active = same(theme, preset.theme);
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(preset.theme)}
                className={cn("grid gap-2 rounded-lg border p-2 text-left transition-colors hover:bg-muted/60", active && "border-primary ring-1 ring-primary")}
              >
                <span className="relative flex h-12 overflow-hidden rounded-md border" style={{ background: pageSwatch[preset.theme.page] }}>
                  <span className="w-1/3" style={{ background: preset.theme.primary }} />
                  <span className={cn(siteFontClass[preset.theme.headingFont === "same" ? preset.theme.font : preset.theme.headingFont], "flex flex-1 items-center justify-center gap-1.5")}>
                    <span className="text-lg font-bold" style={{ fontFamily: "var(--site-font)", color: preset.theme.page === "dark" ? "#fff" : "#111" }}>
                      Aa
                    </span>
                    <span className={cn("h-3 w-6", preset.theme.buttons === "pill" ? "rounded-full" : "rounded-sm")} style={{ background: preset.theme.accent }} />
                  </span>
                  {active && (
                    <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <CheckIcon className="size-3" />
                    </span>
                  )}
                </span>
                <span className="px-0.5 text-xs font-medium">{t(`preset_${preset.id}`)}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">{t("presetsHint")}</p>
      </div>

      <div className="grid gap-4 border-t pt-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="th-primary">{t("primary")}</Label>
            <input id="th-primary" type="color" value={theme.primary} onChange={(e) => onChange({ primary: e.target.value })} className="h-9 w-full cursor-pointer rounded-md border bg-background" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="th-accent">{t("accent")}</Label>
            <input id="th-accent" type="color" value={theme.accent} onChange={(e) => onChange({ accent: e.target.value })} className="h-9 w-full cursor-pointer rounded-md border bg-background" />
          </div>
        </div>
        {select("page", ["light", "tinted", "dark"])}
        <div className="grid grid-cols-2 gap-3">
          {select("font", siteFonts, t("font"))}
          {select("headingFont", ["same", ...siteFonts])}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {select("buttons", ["solid", "outline", "pill", "soft"])}
          {select("cards", ["flat", "outlined", "elevated", "glass"])}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {select("radius", ["sharp", "soft", "round"], t("corners"))}
          {select("spacing", ["compact", "normal", "airy"])}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {select("mode", ["light", "dark"], t("header"))}
          {select("headerLayout", ["classic", "centered"])}
        </div>
      </div>
    </div>
  );
}
