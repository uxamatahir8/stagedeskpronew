"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

/** Requests that shouldn't show the bar: background prefetches and long-lived streams. */
function isBackground(url: string, headers: Headers) {
  return headers.has("next-router-prefetch") || url.includes("/api/notifications/stream") || url.includes("/_next/static");
}

/**
 * A slim bar across the top while the app is busy: page changes, server
 * actions (saving, sending) and other requests. It watches fetch, which is
 * what Next uses for both navigations and actions, so no button needs its
 * own wiring. It only appears when something takes longer than a moment.
 */
export function ActivityBar() {
  const [visible, setVisible] = useState(false);
  const pending = useRef(0);
  const navigating = useRef(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Stable: it only reads refs and sets state, so effects can call it freely.
  const update = useCallback(() => {
    const busy = pending.current > 0 || navigating.current;
    if (busy && !showTimer.current) {
      showTimer.current = setTimeout(() => {
        showTimer.current = null;
        if (pending.current > 0 || navigating.current) setVisible(true);
      }, 150);
    }
    if (!busy) {
      if (showTimer.current) clearTimeout(showTimer.current);
      showTimer.current = null;
      setVisible(false);
    }
  }, []);

  // A finished navigation (new URL) ends the "navigating" state.
  useEffect(() => {
    navigating.current = false;
    update();
  }, [pathname, searchParams, update]);

  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      const tracked = !isBackground(url, headers);
      if (tracked) {
        pending.current++;
        update();
      }
      try {
        return await original(input, init);
      } finally {
        if (tracked) {
          pending.current = Math.max(0, pending.current - 1);
          update();
        }
      }
    };

    // Clicking an internal link shows the bar straight away, before the request starts.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      navigating.current = true;
      update();
      // Never get stuck if a navigation is cancelled.
      setTimeout(() => {
        navigating.current = false;
        update();
      }, 10_000);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      window.fetch = original;
      document.removeEventListener("click", onClick, true);
    };
  }, [update]);

  return (
    <div
      aria-hidden={!visible}
      role="progressbar"
      aria-label="Loading"
      className={`pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
    >
      <div className="absolute inset-0 bg-primary/15" />
      <div className="animate-activity absolute inset-y-0 left-0 w-2/5 rounded-full bg-brand-gradient" />
    </div>
  );
}
