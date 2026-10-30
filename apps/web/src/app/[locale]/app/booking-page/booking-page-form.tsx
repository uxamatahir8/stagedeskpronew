"use client";

import { ArrowDownIcon, ArrowUpIcon, CopyIcon, ExternalLinkIcon, ImageUpIcon, MonitorIcon, PlusIcon, SmartphoneIcon, Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { bookingArtistLayouts, bookingHeroLayouts, type BookingSection, type BookingTheme, siteFonts } from "@stagedesk/core";
import { BookingFrame, type BookingPageData, BookingPageView } from "@/components/booking-page/booking-page-view";
import { sectionHeadingKey } from "@/components/booking-page/shared";
import { FormField } from "@/components/form-field";
import { siteFontClass } from "@/components/sites/fonts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { ActionResult } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { removeCoverAction, saveBookingPageAction, uploadCoverAction } from "./actions";

interface Values {
  enabled: boolean;
  intro: string;
  coverUrl: string | null;
  faq: { question: string; answer: string }[];
  theme: BookingTheme;
}

const accentPresets = ["#572261", "#d6337f", "#e11d48", "#ea580c", "#ca8a04", "#16a34a", "#0d9488", "#2563eb", "#4f46e5", "#171717"];
/** The width the desktop preview is laid out at before it's scaled to fit. */
const DESKTOP_WIDTH = 1280;

/**
 * Booking page settings: the look, texts and section order on the left, a
 * live preview of the real page on the right. Nothing is public until saved.
 */
export function BookingPageForm({ pageUrl, embedCode, preview, values }: { pageUrl: string; embedCode: string; preview: BookingPageData; values: Values }) {
  const t = useTranslations("bookingPageSettings");
  const tp = useTranslations("bookingPage");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(values.enabled);
  const [intro, setIntro] = useState(values.intro);
  const [faq, setFaq] = useState(values.faq.length ? values.faq : [{ question: "", answer: "" }]);
  const [theme, setTheme] = useState(values.theme);
  const coverInput = useRef<HTMLInputElement>(null);

  const set = <K extends keyof BookingTheme>(key: K, value: BookingTheme[K]) => setTheme((th) => ({ ...th, [key]: value }));
  const setSection = (i: number, patch: Partial<BookingSection>) => set("sections", theme.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...theme.sections];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    set("sections", next);
  };

  const run = (task: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const r = await task();
      if (!r.ok) return void (r.message && toast.error(r.message));
      if (r.message) toast.success(r.message);
      router.refresh();
    });

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(t("copied"));
  };

  const save = () => run(() => saveBookingPageAction({ enabled, intro, faq, theme }));
  const data: BookingPageData = { ...preview, intro, faq: faq.filter((f) => f.question.trim() && f.answer.trim()) };
  const accent = theme.accent || preview.brandColor || accentPresets[0]!;

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(22rem,26rem)_1fr]">
      <div className="grid gap-4">
        <Tabs defaultValue="design" className="gap-4">
          <TabsList className="w-full">
            <TabsTrigger value="design">{t("tabDesign")}</TabsTrigger>
            <TabsTrigger value="content">{t("tabContent")}</TabsTrigger>
            <TabsTrigger value="sections">{t("tabSections")}</TabsTrigger>
            <TabsTrigger value="share">{t("tabShare")}</TabsTrigger>
          </TabsList>

          <TabsContent value="design" className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>{t("cover")}</CardTitle>
                <CardDescription>{t("coverHint")}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
                <Choice label={t("heroLayout")}>
                  <div className="grid grid-cols-2 gap-2">
                    {bookingHeroLayouts.map((h) => (
                      <OptionButton key={h} active={theme.hero === h} onClick={() => set("hero", h)} className="grid gap-2 p-2 text-left">
                        <HeroThumb layout={h} accent={accent} cover={values.coverUrl} />
                        <span className="px-1 text-xs font-medium">{t(`hero_${h}`)}</span>
                      </OptionButton>
                    ))}
                  </div>
                </Choice>

                {values.coverUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- served from /files
                  <img src={values.coverUrl} alt="" className="aspect-[3/1] w-full rounded-lg object-cover" />
                )}
                <form action={(form) => run(() => uploadCoverAction(form))} className="flex flex-wrap gap-2">
                  <input
                    ref={coverInput}
                    name="cover"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    aria-label={t("uploadCover")}
                    onChange={(e) => e.currentTarget.form?.requestSubmit()}
                  />
                  <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => coverInput.current?.click()}>
                    <ImageUpIcon />
                    {values.coverUrl ? t("replaceCover") : t("uploadCover")}
                  </Button>
                  {values.coverUrl && (
                    <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => run(removeCoverAction)}>
                      {t("removeCover")}
                    </Button>
                  )}
                </form>

                {theme.hero === "cover" && values.coverUrl && (
                  <Choice label={t("overlay")} htmlFor="bp-overlay" aside={`${theme.overlay}%`}>
                    <input
                      id="bp-overlay"
                      type="range"
                      min={0}
                      max={90}
                      step={5}
                      value={theme.overlay}
                      onChange={(e) => set("overlay", Number(e.target.value))}
                      className="w-full accent-primary"
                    />
                  </Choice>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("style")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5">
                <Choice label={t("accent")} hint={theme.accent ? undefined : t("accentBrandHint")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => set("accent", "")}
                      aria-pressed={theme.accent === ""}
                      className={cn("h-8 rounded-full border px-3 text-xs font-medium", theme.accent === "" ? "border-primary bg-primary/10" : "hover:bg-muted")}
                    >
                      {t("accentBrand")}
                    </button>
                    {accentPresets.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => set("accent", c)}
                        aria-label={c}
                        aria-pressed={theme.accent === c}
                        style={{ background: c }}
                        className={cn("size-8 rounded-full ring-offset-2 ring-offset-background", theme.accent === c ? "ring-2 ring-foreground" : "ring-1 ring-black/10")}
                      />
                    ))}
                    <label className="relative size-8 cursor-pointer overflow-hidden rounded-full bg-[conic-gradient(red,yellow,lime,aqua,blue,magenta,red)] ring-1 ring-black/10" title={t("accentCustom")}>
                      <span className="sr-only">{t("accentCustom")}</span>
                      <input type="color" value={accent} onChange={(e) => set("accent", e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
                    </label>
                  </div>
                </Choice>

                <Choice label={t("font")}>
                  <div className="grid grid-cols-4 gap-2">
                    {siteFonts.map((f) => (
                      <OptionButton key={f} active={theme.font === f} onClick={() => set("font", f)} className={cn(siteFontClass[f], "grid gap-0.5 py-2.5")}>
                        <span className="text-xl font-semibold" style={{ fontFamily: "var(--site-font)" }}>
                          Aa
                        </span>
                        <span className="text-[11px] text-muted-foreground">{t(`font_${f}`)}</span>
                      </OptionButton>
                    ))}
                  </div>
                </Choice>

                <Segmented label={t("radius")} value={theme.radius} options={(["sharp", "soft", "round"] as const).map((r) => [r, t(`radius_${r}`)])} onChange={(v) => set("radius", v)} />
                <Segmented label={t("mode")} value={theme.mode} options={(["light", "dark"] as const).map((m) => [m, t(`mode_${m}`)])} onChange={(v) => set("mode", v)} />
                <Segmented label={t("artistLayout")} value={theme.artistLayout} options={bookingArtistLayouts.map((l) => [l, t(`artistLayout_${l}`)])} onChange={(v) => set("artistLayout", v)} />

                <div className="flex items-center justify-between gap-4">
                  <div className="grid gap-0.5">
                    <label htmlFor="bp-stats" className="text-sm font-medium">
                      {t("showStats")}
                    </label>
                    <p className="text-xs text-muted-foreground">{t("showStatsHint")}</p>
                  </div>
                  <Switch id="bp-stats" checked={theme.showStats} onCheckedChange={(v) => set("showStats", v)} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="content" className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>{t("heroText")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <FormField id="bp-headline" label={t("headline")} hint={t("headlineHint")}>
                  <Input id="bp-headline" value={theme.headline} placeholder={preview.name} maxLength={120} onChange={(e) => set("headline", e.target.value)} />
                </FormField>
                <FormField id="bp-tagline" label={t("tagline")}>
                  <Textarea id="bp-tagline" value={theme.tagline} rows={2} maxLength={240} placeholder={t("taglinePlaceholder")} onChange={(e) => set("tagline", e.target.value)} />
                </FormField>
                <FormField id="bp-cta" label={t("ctaLabel")}>
                  <Input id="bp-cta" value={theme.ctaLabel} placeholder={tp("requestQuote")} maxLength={40} onChange={(e) => set("ctaLabel", e.target.value)} />
                </FormField>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("content")}</CardTitle>
                <CardDescription>{t("artistsHint")}</CardDescription>
              </CardHeader>
              <CardContent>
                <FormField id="bp-intro" label={t("intro")} hint={t("introHint")}>
                  <Textarea id="bp-intro" value={intro} onChange={(e) => setIntro(e.target.value)} rows={6} maxLength={5000} />
                </FormField>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("faq")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                {faq.map((item, i) => (
                  <div key={i} className="grid gap-2 rounded-xl border p-3">
                    <div className="flex items-end gap-2">
                      <FormField id={`bp-q-${i}`} label={t("question")} className="flex-1">
                        <Input
                          id={`bp-q-${i}`}
                          value={item.question}
                          maxLength={300}
                          onChange={(e) => setFaq((f) => f.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)))}
                        />
                      </FormField>
                      <Button variant="ghost" size="icon-sm" aria-label={t("removeFaq")} onClick={() => setFaq((f) => f.filter((_, j) => j !== i))}>
                        <Trash2Icon />
                      </Button>
                    </div>
                    <FormField id={`bp-a-${i}`} label={t("answer")}>
                      <Textarea
                        id={`bp-a-${i}`}
                        value={item.answer}
                        rows={2}
                        maxLength={3000}
                        onChange={(e) => setFaq((f) => f.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))}
                      />
                    </FormField>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-fit" disabled={faq.length >= 20} onClick={() => setFaq((f) => [...f, { question: "", answer: "" }])}>
                  <PlusIcon />
                  {t("addFaq")}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sections">
            <Card>
              <CardHeader>
                <CardTitle>{t("sections")}</CardTitle>
                <CardDescription>{t("sectionsHint")}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                {theme.sections.map((s, i) => (
                  <div key={s.key} className={cn("grid gap-2 rounded-xl border p-3 transition-opacity", !s.visible && "bg-muted/40")}>
                    <div className="flex items-center gap-2">
                      <span className={cn("flex-1 text-sm font-medium", !s.visible && "text-muted-foreground")}>{t(`section_${s.key}`)}</span>
                      <Button variant="ghost" size="icon-sm" aria-label={t("moveUp")} disabled={i === 0} onClick={() => move(i, -1)}>
                        <ArrowUpIcon />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={t("moveDown")} disabled={i === theme.sections.length - 1} onClick={() => move(i, 1)}>
                        <ArrowDownIcon />
                      </Button>
                      <Switch checked={s.visible} aria-label={t("showSection", { section: t(`section_${s.key}`) })} onCheckedChange={(v) => setSection(i, { visible: v })} />
                    </div>
                    {s.visible && (
                      <Input
                        value={s.heading}
                        maxLength={80}
                        aria-label={t("sectionHeading", { section: t(`section_${s.key}`) })}
                        placeholder={tp(sectionHeadingKey[s.key])}
                        onChange={(e) => setSection(i, { heading: e.target.value })}
                        className="h-8 text-sm"
                      />
                    )}
                  </div>
                ))}
                <p className="pt-2 text-xs text-muted-foreground">{t("sectionsEmptyHint")}</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="share" className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>{t("yourPage")}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded-md bg-muted px-2 py-1 text-sm break-all">{pageUrl}</code>
                  <Button variant="outline" size="sm" asChild>
                    <a href={pageUrl} target="_blank" rel="noopener">
                      <ExternalLinkIcon />
                      {t("open")}
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => copy(pageUrl)}>
                    <CopyIcon />
                    {t("copyLink")}
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <div className="grid gap-0.5">
                    <label htmlFor="bp-enabled" className="text-sm font-medium">
                      {t("enabled")}
                    </label>
                    <p className="text-xs text-muted-foreground">{t("enabledHint")}</p>
                  </div>
                  <Switch id="bp-enabled" checked={enabled} onCheckedChange={setEnabled} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("embed")}</CardTitle>
                <CardDescription>{t("embedHint")}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
                  <code>{embedCode}</code>
                </pre>
                <Button variant="outline" size="sm" className="w-fit" onClick={() => copy(embedCode)}>
                  <CopyIcon />
                  {t("copyCode")}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
          <p className="text-xs text-muted-foreground">{t("saveHint")}</p>
          <Button disabled={pending} onClick={save}>
            {t("save")}
          </Button>
        </div>
      </div>

      <Preview data={data} theme={theme} />
    </div>
  );
}

/** The real page, laid out at desktop width and scaled to fit, or at phone width. */
function Preview({ data, theme }: { data: BookingPageData; theme: BookingTheme }) {
  const t = useTranslations("bookingPageSettings");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const zoom = device === "desktop" && width > 0 ? Math.min(1, width / DESKTOP_WIDTH) : 1;

  return (
    <div className="grid gap-3 xl:sticky xl:top-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium">{t("preview")}</p>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1" role="group" aria-label={t("device")}>
          {(
            [
              ["desktop", MonitorIcon],
              ["mobile", SmartphoneIcon],
            ] as const
          ).map(([d, Icon]) => (
            <button
              key={d}
              type="button"
              onClick={() => setDevice(d)}
              aria-pressed={device === d}
              aria-label={t(d)}
              className={cn("rounded-md p-1.5", device === d ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      </div>
      <div ref={box} className="overflow-hidden rounded-xl border bg-muted/40">
        <div
          data-testid="booking-page-preview"
          className={cn("h-[calc(100svh-9rem)] min-h-[32rem] overflow-y-auto", device === "mobile" && "mx-auto my-4 h-[calc(100svh-11rem)] max-w-[390px] rounded-[2rem] border-8 border-foreground/80")}
        >
          {/* Links in the preview don't leave the settings. */}
          <div style={{ width: device === "desktop" ? DESKTOP_WIDTH : undefined, zoom }} onClickCapture={(e) => (e.target as HTMLElement).closest("a[href^='/'], a[href^='http']") && e.preventDefault()}>
            <BookingFrame theme={theme} brandColor={data.brandColor}>
              <BookingPageView data={data} theme={theme} preview form={<FormStandIn />} />
            </BookingFrame>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Looks like the inquiry form; the preview never sends anything. */
function FormStandIn() {
  const t = useTranslations("bookingPage");
  const field = (label: string, wide = false) => (
    <div className={cn("grid gap-1.5", wide && "col-span-2")}>
      <span className="text-sm font-medium">{label}</span>
      <span className={cn("block rounded-md border bg-background", wide ? "h-20" : "h-9")} />
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-4" aria-hidden>
      {field(t("eventType"))}
      {field(t("date"))}
      {field(t("venueCity"))}
      {field(t("guests"))}
      {field(t("name"))}
      {field(t("email"))}
      {field(t("message"), true)}
      <span className="col-span-2 inline-flex h-10 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground">{t("submit")}</span>
    </div>
  );
}

function Choice({ label, hint, htmlFor, aside, children }: { label: string; hint?: string; htmlFor?: string; aside?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-sm font-medium">
            {label}
          </label>
        ) : (
          <p className="text-sm font-medium">{label}</p>
        )}
        {aside && <span className="text-xs text-muted-foreground tabular-nums">{aside}</span>}
      </div>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function OptionButton({ active, onClick, className, children }: { active: boolean; onClick: () => void; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn("rounded-lg border transition-colors", active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/60", className)}
    >
      {children}
    </button>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: (readonly [T, string])[]; onChange: (value: T) => void }) {
  return (
    <Choice label={label}>
      <div className="flex rounded-lg bg-muted p-1" role="group" aria-label={label}>
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            aria-pressed={value === v}
            onClick={() => onChange(v)}
            className={cn("flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors", value === v ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {text}
          </button>
        ))}
      </div>
    </Choice>
  );
}

/** A tiny wireframe of each cover layout. */
function HeroThumb({ layout, accent, cover }: { layout: BookingTheme["hero"]; accent: string; cover: string | null }) {
  const image = cover ? { backgroundImage: `url(${cover})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: accent };
  const lines = (light: boolean, center = false) => (
    <span className={cn("grid gap-1", center && "justify-items-center")}>
      <span className={cn("h-1.5 w-14 rounded-full", light ? "bg-white/90" : "bg-foreground/70")} />
      <span className={cn("h-1 w-10 rounded-full", light ? "bg-white/60" : "bg-foreground/30")} />
      <span className="mt-0.5 h-2 w-6 rounded-sm" style={{ background: light ? "white" : accent }} />
    </span>
  );
  return (
    <span className="block aspect-[16/10] overflow-hidden rounded-md border bg-background">
      {layout === "cover" && (
        <span className="relative flex size-full items-end p-2" style={image}>
          <span className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/10" />
          <span className="relative">{lines(true)}</span>
        </span>
      )}
      {layout === "split" && (
        <span className="grid size-full grid-cols-2 items-center gap-2 p-2">
          {lines(false)}
          <span className="h-full rounded-sm" style={image} />
        </span>
      )}
      {layout === "banner" && (
        <span className="grid size-full grid-rows-[1fr_auto]">
          <span style={image} />
          <span className="mx-2 -mt-3 mb-2 rounded-sm border bg-card p-1.5">{lines(false)}</span>
        </span>
      )}
      {layout === "minimal" && <span className="flex size-full items-center justify-center">{lines(false, true)}</span>}
    </span>
  );
}
