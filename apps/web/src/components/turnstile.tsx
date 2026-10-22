"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: { sitekey: string; language?: string; callback?: (token: string) => void }) => string;
      remove: (id: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad";
let loading: Promise<void> | null = null;

function loadScript() {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise<void>((resolve) => {
    window.onTurnstileLoad = () => resolve();
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    document.head.appendChild(s);
  });
  return loading;
}

/** Cloudflare Turnstile widget. Adds a hidden `cf-turnstile-response` field to the surrounding form. */
export function Turnstile({ siteKey, language }: { siteKey: string; language: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let id: string | undefined;
    let cancelled = false;
    void loadScript().then(() => {
      if (!cancelled && ref.current && window.turnstile) id = window.turnstile.render(ref.current, { sitekey: siteKey, language });
    });
    return () => {
      cancelled = true;
      if (id) window.turnstile?.remove(id);
    };
  }, [siteKey, language]);

  return <div ref={ref} className="min-h-[65px]" />;
}
