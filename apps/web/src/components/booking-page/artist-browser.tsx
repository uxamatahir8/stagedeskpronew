"use client";

import { ArrowRightIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import type { BookingTheme } from "@stagedesk/core";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { BookingArtist } from "./booking-page-view";
import { accentTint, FORM_ANCHOR, PREFER_ARTIST_EVENT } from "./shared";

const pageSize: Record<BookingTheme["artistLayout"], number> = { grid: 9, portrait: 8, list: 8 };

/**
 * The artists on a booking page: search and genre filters once the list is
 * long, the first few until "show all", and details in a dialog. In the
 * settings preview cards don't open.
 */
export function ArtistBrowser({ artists, layout, preview = false }: { artists: BookingArtist[]; layout: BookingTheme["artistLayout"]; preview?: boolean }) {
  const t = useTranslations("bookingPage");
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState<BookingArtist | null>(null);
  const [portal, setPortal] = useState<HTMLElement | null>(null);
  const root = useRef<HTMLDivElement>(null);

  // The most common genres, as filter chips.
  const genres = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of artists) for (const g of a.genres) counts.set(g, (counts.get(g) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10).map(([g]) => g);
  }, [artists]);

  const q = query.trim().toLowerCase();
  const filtered = artists.filter(
    (a) => (!genre || a.genres.includes(genre)) && (!q || a.stageName.toLowerCase().includes(q) || a.genres.some((g) => g.toLowerCase().includes(q))),
  );
  const limit = pageSize[layout];
  const filtering = q !== "" || genre !== null;
  const shown = expanded || filtering ? filtered : filtered.slice(0, limit);
  const showControls = artists.length > limit;

  const select = (artist: BookingArtist) => {
    if (preview) return;
    setPortal(root.current?.closest<HTMLElement>("[data-bp-frame]") ?? null);
    setOpen(artist);
  };

  return (
    <div ref={root} className="grid gap-8">
      {showControls && (
        <div className="grid gap-4">
          <label className="relative block max-w-md">
            <span className="sr-only">{t("searchArtists")}</span>
            <SearchIcon className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("searchArtists")}
              className="h-12 w-full rounded-full border bg-card pr-4 pl-11 text-base outline-none placeholder:text-muted-foreground focus-visible:border-[var(--bp-accent)] focus-visible:ring-3 focus-visible:ring-[color-mix(in_oklab,var(--bp-accent)_25%,transparent)]"
            />
          </label>
          {genres.length > 1 && (
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] @3xl:mx-0 @3xl:flex-wrap @3xl:px-0">
              {[null, ...genres].map((g) => {
                const active = genre === g;
                return (
                  <button
                    key={g ?? "all"}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setGenre(g)}
                    className={cn(
                      "shrink-0 rounded-full border px-4 py-1.5 text-sm transition-colors",
                      active ? "border-transparent bg-[var(--bp-accent)] text-[var(--bp-on-accent)]" : "bg-card text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {g ?? t("allGenres")}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="rounded-[var(--bp-radius-lg)] border border-dashed p-10 text-center text-muted-foreground">{t("noArtistsMatch")}</p>
      ) : layout === "list" ? (
        <ul className="divide-y rounded-[var(--bp-radius-lg)] border bg-card">
          {shown.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => select(a)} className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-muted/50 @3xl:px-6">
                <Photo artist={a} className="size-14 rounded-[var(--bp-radius)] text-xl" />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate font-semibold">{a.stageName}</span>
                  {a.genres.length > 0 && <span className="truncate text-sm text-muted-foreground">{a.genres.join(" · ")}</span>}
                </span>
                <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : layout === "portrait" ? (
        <ul className="grid grid-cols-2 gap-3 @3xl:grid-cols-4 @3xl:gap-5">
          {shown.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => select(a)} className="group relative block aspect-[3/4] w-full overflow-hidden rounded-[var(--bp-radius-lg)] text-left">
                <Photo artist={a} className="absolute inset-0 size-full text-6xl transition-transform duration-500 group-hover:scale-105" />
                <span className="absolute inset-x-0 bottom-0 grid gap-0.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pt-16 text-white">
                  <span className="truncate font-semibold @3xl:text-lg">{a.stageName}</span>
                  {a.genres.length > 0 && <span className="truncate text-xs opacity-80 @3xl:text-sm">{a.genres.slice(0, 2).join(" · ")}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid gap-5 @xl:grid-cols-2 @4xl:grid-cols-3">
          {shown.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => select(a)} className="group grid h-full w-full content-start gap-4 text-left">
                <span className="block aspect-[4/3] overflow-hidden rounded-[var(--bp-radius-lg)]">
                  <Photo artist={a} className="size-full text-6xl transition-transform duration-500 group-hover:scale-105" />
                </span>
                <span className="grid gap-1 px-1">
                  <span className="flex items-center justify-between gap-3 text-lg font-semibold">
                    <span className="truncate">{a.stageName}</span>
                    <ArrowRightIcon className="size-4 shrink-0 -translate-x-1 text-[var(--bp-accent)] opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" aria-hidden />
                  </span>
                  {a.genres.length > 0 && <span className="line-clamp-1 text-sm text-muted-foreground">{a.genres.join(" · ")}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!expanded && !filtering && filtered.length > limit && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mx-auto rounded-full border bg-card px-6 py-3 text-sm font-medium transition-colors hover:border-[var(--bp-accent)]"
        >
          {t("showAllArtists", { count: artists.length })}
        </button>
      )}

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        {open && (
          <DialogContent container={portal} className="max-h-[calc(100svh-2rem)] gap-0 overflow-y-auto rounded-[var(--bp-radius-lg)] p-0 sm:max-w-2xl">
            <Photo artist={open} className={cn("w-full text-7xl", open.photoUrl ? "aspect-[16/9]" : "h-44")} />
            <div className="grid gap-5 p-6 @container sm:p-8">
              <div className="grid gap-1.5">
                <DialogTitle className="text-2xl font-semibold tracking-tight">{open.stageName}</DialogTitle>
                <DialogDescription className={cn(open.genres.length === 0 && "sr-only")}>{open.genres.join(" · ") || open.stageName}</DialogDescription>
              </div>
              {open.bio && <p className="leading-relaxed whitespace-pre-line text-muted-foreground">{open.bio}</p>}
              {open.media && (
                <iframe
                  src={open.media.embedUrl}
                  title={`${open.stageName} – ${t("listen")}`}
                  loading="lazy"
                  allow="encrypted-media; picture-in-picture"
                  referrerPolicy="strict-origin-when-cross-origin"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
                  className={cn("w-full rounded-[var(--bp-radius)]", open.media.provider === "youtube" || open.media.provider === "vimeo" ? "aspect-video" : "h-36")}
                />
              )}
              <a
                href={`#${FORM_ANCHOR}`}
                onClick={() => {
                  window.dispatchEvent(new CustomEvent(PREFER_ARTIST_EVENT, { detail: open.id }));
                  setOpen(null);
                }}
                className="inline-flex w-fit items-center gap-2 rounded-[var(--bp-radius)] bg-[var(--bp-accent)] px-5 py-3 text-sm font-semibold text-[var(--bp-on-accent)] transition hover:brightness-110"
              >
                {t("requestArtist", { name: open.stageName })}
                <ArrowRightIcon className="size-4" aria-hidden />
              </a>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function Photo({ artist, className }: { artist: BookingArtist; className?: string }) {
  if (artist.photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- served from /files
    return <img src={artist.photoUrl} alt="" loading="lazy" className={cn("object-cover", className)} />;
  }
  // No photo: initials on a gradient whose hue drifts per artist, so a long list doesn't look like one tile repeated.
  const shift = ([...artist.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7) % 70) - 35;
  const tone = (offset: number, amount: number) => `color-mix(in oklab, oklch(from var(--bp-accent) l c calc(h + ${shift + offset})) ${amount}%, var(--card))`;
  const initials = artist.stageName
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w))
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      style={{ background: `linear-gradient(135deg, ${tone(0, 16)}, ${tone(45, 34)})` }}
      className={cn("flex items-center justify-center font-semibold tracking-tight text-[color-mix(in_oklab,var(--bp-accent)_70%,var(--foreground))]", accentTint, className)}
    >
      {initials || "♪"}
    </span>
  );
}
