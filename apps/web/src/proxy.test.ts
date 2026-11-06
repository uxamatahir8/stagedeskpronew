import { NextRequest, NextResponse, type NextFetchEvent } from "next/server";
import { describe, expect, it, vi } from "vitest";
import proxy from "./proxy";

// The language decision is under test here; the real next-intl routing runs in e2e/visitor-region.spec.ts.
vi.mock("next-intl/middleware", () => ({ default: () => () => NextResponse.next() }));

const event = { waitUntil() {} } as unknown as NextFetchEvent;

function visit(path: string, opts: { country?: string; browser?: string; cookie?: string; headers?: Record<string, string> } = {}) {
  const request = new NextRequest(new URL(path, "http://localhost:3000"), {
    headers: {
      accept: "text/html",
      "user-agent": "Mozilla/5.0 Chrome/130",
      ...(opts.country ? { "cf-ipcountry": opts.country } : {}),
      ...(opts.browser ? { "accept-language": opts.browser } : {}),
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
      ...opts.headers,
    },
  });
  return proxy(request, event);
}

const target = (r: Response) => r.headers.get("location");
const redirectedToDutch = (r: Response, path: string) => expect([r.status, new URL(target(r) ?? "/", "http://localhost:3000").pathname]).toEqual([307, path]);
const stays = (r: Response) => expect(target(r)).toBeNull();

describe("language on a page load", () => {
  it("sends a first visitor in the Netherlands to Dutch, whatever their browser says", () => {
    redirectedToDutch(visit("/", { country: "NL", browser: "en-GB,en;q=0.9" }), "/nl");
    redirectedToDutch(visit("/pricing", { country: "NL", browser: "en-GB" }), "/nl/pricing");
    redirectedToDutch(visit("/pricing", { country: "NL", browser: "nl-NL" }), "/nl/pricing");
  });

  it("keeps the query string", () => {
    expect(target(visit("/pricing?via=abc&x=1", { country: "NL" }))).toContain("/nl/pricing?via=abc&x=1");
  });

  it("keeps English for the UK, the US and Belgian English browsers", () => {
    stays(visit("/pricing", { country: "GB", browser: "en-GB" }));
    stays(visit("/pricing", { country: "US", browser: "en-US" }));
    stays(visit("/pricing", { country: "BE", browser: "en-GB" }));
  });

  it("uses Dutch in Belgium for a Dutch browser", () => {
    redirectedToDutch(visit("/pricing", { country: "BE", browser: "nl-BE" }), "/nl/pricing");
  });

  it("falls back to the browser without a usable country", () => {
    redirectedToDutch(visit("/pricing", { browser: "nl-NL" }), "/nl/pricing");
    stays(visit("/pricing", { browser: "en-GB" }));
    stays(visit("/pricing", { country: "XX", browser: "en-GB" }));
    redirectedToDutch(visit("/pricing", { country: "T1", browser: "nl" }), "/nl/pricing");
    stays(visit("/pricing"));
  });

  it("never stores the detected language", () => {
    const toDutch = visit("/pricing", { country: "NL", browser: "en-GB" });
    const staying = visit("/pricing", { country: "GB", browser: "en-GB" });
    const onDutchUrl = visit("/nl/pricing", { country: "GB", browser: "en-GB" });
    for (const r of [toDutch, staying, onDutchUrl]) expect(r.headers.get("set-cookie") ?? "").not.toMatch(/locale_choice|visitor_locale=[a-z]/);
  });
});

describe("explicit choices", () => {
  it("keeps a chosen language wherever the visitor is", () => {
    stays(visit("/pricing", { country: "NL", browser: "nl-NL", cookie: "locale_choice=en" }));
    redirectedToDutch(visit("/pricing", { country: "US", browser: "en-US", cookie: "locale_choice=nl" }), "/nl/pricing");
  });

  it("opens a /nl address in Dutch, even for someone who chose English", () => {
    stays(visit("/nl/pricing", { country: "NL", browser: "en-GB" }));
    stays(visit("/nl/pricing", { country: "GB", browser: "en-GB" }));
    stays(visit("/nl/pricing", { country: "NL", browser: "en-GB", cookie: "locale_choice=en" }));
  });

  it("ignores an invalid cookie", () => {
    redirectedToDutch(visit("/pricing", { country: "NL", cookie: "locale_choice=xx" }), "/nl/pricing");
  });

  it("re-detects a visitor who only has the old cookie, and removes it", () => {
    const moved = visit("/pricing", { country: "NL", browser: "en-GB", cookie: "visitor_locale=en" });
    redirectedToDutch(moved, "/nl/pricing");
    expect(moved.headers.get("set-cookie")).toMatch(/visitor_locale=;/);
    const stayed = visit("/pricing", { country: "GB", browser: "en-GB", cookie: "visitor_locale=nl" });
    stays(stayed);
    expect(stayed.headers.get("set-cookie")).toMatch(/visitor_locale=;/);
  });
});

describe("what must not be redirected", () => {
  it("leaves crawlers on the address they asked for", () => {
    stays(visit("/pricing", { country: "NL", browser: "nl-NL", headers: { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" } }));
  });

  it("leaves client navigation, prefetches and non-page requests alone", () => {
    stays(visit("/pricing", { country: "NL", headers: { rsc: "1" } }));
    stays(visit("/pricing", { country: "NL", headers: { "next-router-prefetch": "1" } }));
    stays(visit("/pricing", { country: "NL", headers: { accept: "*/*" } }));
  });

  it("leaves the embeddable form in its own language", () => {
    stays(visit("/embed/some-agency", { country: "NL" }));
  });

  it("doesn't turn /en addresses into /nl/en", () => {
    expect(target(visit("/en/pricing", { country: "NL" })) ?? "").not.toContain("/nl/en");
    expect(target(visit("/en", { country: "NL" })) ?? "").not.toContain("/nl/en");
  });

  it("can't loop: the redirect target is never redirected again", () => {
    const first = visit("/pricing", { country: "NL", browser: "en-GB" });
    stays(visit(new URL(target(first)!, "http://localhost:3000").pathname, { country: "NL", browser: "en-GB" }));
  });
});

describe("caching", () => {
  it("keeps language redirects out of shared caches", () => {
    const r = visit("/pricing", { country: "NL" });
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("vary")).toMatch(/Cookie/);
    expect(r.headers.get("vary")).toMatch(/Accept-Language/);
  });
});
