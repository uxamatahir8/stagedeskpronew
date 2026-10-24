"use client";

import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { markGuidesSeenAction } from "@/lib/guide-actions";
import { cn } from "@/lib/utils";

export interface GuideStep {
  id: string;
  /** CSS selector of what to point at; null for a card in the middle of the screen. */
  target: string | null;
  title: string;
  body: string;
}

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 6;
const CARD_W = 340;

/** The visible box of the first matching element, or null when it's hidden (e.g. the sidebar on a phone). */
function rectOf(selector: string | null): Rect | null {
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > innerHeight) return null;
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 };
}

/** Next to the highlighted item: to its right (sidebar) or below it (top bar), kept on screen. */
function cardPosition(rect: Rect | null, cardHeight: number) {
  if (!rect || innerWidth < 640) return null;
  const right = rect.left + rect.width + 16;
  if (right + CARD_W < innerWidth - 16) return { top: Math.min(Math.max(16, rect.top), innerHeight - cardHeight - 16), left: right };
  return { top: Math.min(rect.top + rect.height + 12, innerHeight - cardHeight - 16), left: Math.max(16, Math.min(rect.left + rect.width - CARD_W, innerWidth - CARD_W - 16)) };
}

/**
 * A guided tour of the app: shown once after signing in for the first time,
 * and as a short "what's new" tour for steps added later. Every shown step is
 * stored as seen; the account menu can start the whole tour again.
 */
export function GuideTour({ steps, allSteps, mode }: { steps: GuideStep[]; allSteps: GuideStep[]; mode: "first" | "new" | null }) {
  const t = useTranslations("guides");
  const [active, setActive] = useState<GuideStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardHeight, setCardHeight] = useState(220);
  const card = useRef<HTMLDivElement>(null);
  const shown = useRef(new Set<string>());

  // Starts by itself after the page has settled; the menu can start the full tour any time.
  useEffect(() => {
    const timer = mode && steps.length > 0 ? setTimeout(() => setActive(steps), 900) : null;
    const replay = () => {
      setIndex(0);
      setActive(allSteps);
    };
    window.addEventListener("stagedesk:tour", replay);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("stagedesk:tour", replay);
    };
  }, [mode, steps, allSteps]);

  const step = active?.[index] ?? null;

  const measure = useCallback(() => {
    if (!step) return;
    setRect(rectOf(step.target));
    if (card.current) setCardHeight(card.current.offsetHeight);
  }, [step]);

  useEffect(() => {
    if (!step) return;
    shown.current.add(step.id);
    if (step.target) document.querySelector(step.target)?.scrollIntoView({ block: "nearest" });
    // Measured on the next frame, once the item has scrolled into view.
    const frame = requestAnimationFrame(() => {
      measure();
      card.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [step, measure]);

  useEffect(() => {
    if (!step) return;
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, measure]);

  const close = useCallback(() => {
    // Skipping counts as seen too: the tour shouldn't come back on every visit.
    const ids = [...new Set([...shown.current, ...(active ?? []).map((s) => s.id)])];
    setActive(null);
    setIndex(0);
    void markGuidesSeenAction(ids);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, active.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, close]);

  if (!active || !step) return null;
  const last = index === active.length - 1;
  const pos = cardPosition(rect, cardHeight);
  const isNew = mode === "new" && active === steps;

  return (
    <div className="fixed inset-0 z-[70]" role="presentation">
      {/* The dimmed page with a window around the highlighted item; clicking outside does nothing. */}
      <svg aria-hidden className="pointer-events-none fixed inset-0 h-full w-full">
        <defs>
          <mask id="guide-window">
            <rect width="100%" height="100%" fill="white" />
            {rect && <rect x={rect.left} y={rect.top} width={rect.width} height={rect.height} rx={12} fill="black" />}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="#120816" fillOpacity={0.62} mask="url(#guide-window)" />
      </svg>
      {rect && (
        <div
          aria-hidden
          className="pointer-events-none fixed rounded-xl border-2 border-[oklch(0.66_0.2_352)] transition-all duration-300 ease-out"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      )}
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        aria-describedby="guide-body"
        tabIndex={-1}
        className={cn(
          "fixed grid w-[min(340px,calc(100vw-2rem))] gap-3 rounded-2xl border bg-card p-5 text-card-foreground shadow-2xl outline-none transition-[top,left] duration-300 ease-out",
          !pos && "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
        )}
        style={pos ? { top: pos.top, left: pos.left } : undefined}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-1">
            <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              {isNew && <span className="rounded-full bg-[oklch(0.66_0.2_352)] px-2 py-0.5 text-[11px] font-semibold text-white">{t("newBadge")}</span>}
              {active.length > 1 && t("stepOf", { step: index + 1, total: active.length })}
            </p>
            <h2 id="guide-title" className="text-lg font-semibold text-balance">
              {step.title}
            </h2>
          </div>
          <Button variant="ghost" size="icon" className="-mt-1 -mr-2 size-8 shrink-0" aria-label={t("skip")} onClick={close}>
            <XIcon />
          </Button>
        </div>
        <p id="guide-body" className="text-sm text-muted-foreground">
          {step.body}
        </p>
        {active.length > 1 && (
          <div className="flex gap-1" aria-hidden>
            {active.map((s, i) => (
              <span key={s.id} className={cn("h-1 flex-1 rounded-full", i <= index ? "bg-primary" : "bg-muted")} />
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={close}>
            {t("skip")}
          </Button>
          <div className="flex gap-2">
            {index > 0 && (
              <Button variant="outline" size="sm" onClick={() => setIndex(index - 1)}>
                {t("back")}
              </Button>
            )}
            <Button size="sm" onClick={() => (last ? close() : setIndex(index + 1))}>
              {last ? t("finish") : t("next")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
