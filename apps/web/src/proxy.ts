import { getSessionCookie } from "better-auth/cookies";
import { type NextFetchEvent, NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { defaultLocale, formatViaCookie, isCrawler, LEGACY_LOCALE_COOKIE, LOCALE_COOKIE, normalizeCampaign, normalizeCode, siteHost, viaCookie, visitorCountry, visitorLanguage, localePrefix, locales } from "@stagedesk/core";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);

// Optimistic check only: pages verify the session for real (lib/viewer.ts).
const protectedPrefixes = ["/app", "/onboarding", "/accept-terms"];

/** Free agency subdomains live under this domain (feestband.stagedesk.site; feestband.localhost in development). */
const sitesBase = process.env.SITES_BASE_DOMAIN || "localhost";
/** The platform's own hosts: never an agency site. */
const platformHosts = (() => {
  const url = process.env.BETTER_AUTH_URL ?? process.env.APP_URL ?? "http://localhost:3000";
  const host = new URL(url).hostname;
  const bare = host.replace(/^www\./, "");
  return [host, bare, `www.${bare}`];
})();

/**
 * Requests for an agency site (a free subdomain or a connected domain) are
 * rewritten to /sites/<host>/…, which looks the site up. The proxy itself
 * stays free of database work: unknown hosts simply render a not-found page.
 */
function agencySite(request: NextRequest) {
  const host = request.headers.get("host");
  if (!host || !siteHost(host, sitesBase, platformHosts)) return null;
  const url = request.nextUrl.clone();
  const { pathname } = request.nextUrl;
  url.pathname = `/sites/${encodeURIComponent(host.toLowerCase().replace(/:\d+$/, ""))}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  const site = agencySite(request);
  if (site) return site;
  const { pathname, search } = request.nextUrl;
  // The platform's own sitemap and robots (matched below only so agency sites can have theirs).
  if (pathname === "/sitemap.xml" || pathname === "/robots.txt") return NextResponse.next();
  // The language prefix (none for English), kept when sending someone to sign in.
  const prefix = locales.map((l) => localePrefix(l)).find((p) => p && (pathname === p || pathname.startsWith(`${p}/`))) ?? "";
  const path = pathname.slice(prefix.length) || "/";

  const language = chooseLanguage(request, prefix, path);
  if (language?.redirect) return language.redirect;

  const needsSession = protectedPrefixes.some((p) => path === p || path.startsWith(`${p}/`));
  if (needsSession && !getSessionCookie(request)) {
    const url = new URL(`${prefix}/sign-in`, request.url);
    url.searchParams.set("next", `${path}${search}`);
    return NextResponse.redirect(url);
  }
  const response = intl(request);
  if (language) forgetLegacyLanguage(response, request);
  trackReferral(request, response, event, path);
  return response;
}

/** Never moved to another language: machine endpoints, and the embeddable form (its script picks the language). */
const fixedLanguage = ["/api", "/embed"];

/**
 * Picks the language for full page loads of English (unprefixed) addresses:
 * the visitor's own choice, else their country, else their browser. The guess
 * is made fresh each time and never stored, so it can't outlive a move to
 * another country or a wrong first answer. A /nl address always opens in Dutch,
 * and search engines always get the address they asked for.
 */
function chooseLanguage(request: NextRequest, prefix: string, path: string) {
  const h = request.headers;
  const pageLoad = request.method === "GET" && !h.get("rsc") && !h.get("next-router-prefetch") && (h.get("sec-fetch-dest") === "document" || (h.get("accept") ?? "").includes("text/html"));
  if (!pageLoad || isCrawler(h.get("user-agent")) || fixedLanguage.some((p) => path === p || path.startsWith(`${p}/`))) return null;

  // Unprefixed addresses are where the visitor's language decides. /en/… is one that next-intl
  // shortens first (to /…), which is then judged like any other.
  const decides = prefix === "" && path !== `/${defaultLocale}` && !path.startsWith(`/${defaultLocale}/`);
  const wanted = decides
    ? visitorLanguage({ choice: request.cookies.get(LOCALE_COOKIE)?.value, country: visitorCountry((name) => h.get(name)), acceptLanguage: h.get("accept-language") })
    : defaultLocale;
  if (wanted === defaultLocale) return { redirect: null };

  const url = request.nextUrl.clone();
  url.pathname = `${localePrefix(wanted)}${path === "/" ? "" : path}`;
  const redirect = NextResponse.redirect(url, 307);
  // The answer depends on who asks: never store it in a shared cache.
  redirect.headers.set("Cache-Control", "private, no-store");
  redirect.headers.set("Vary", "Cookie, Accept-Language, CF-IPCountry");
  forgetLegacyLanguage(redirect, request);
  return { redirect };
}

/** The old cookie holds guesses that would otherwise look like choices; nothing reads it any more. */
function forgetLegacyLanguage(response: NextResponse, request: NextRequest) {
  if (request.cookies.has(LEGACY_LOCALE_COOKIE)) response.cookies.delete(LEGACY_LOCALE_COOKIE);
}

/**
 * ?via=<code>&c=<campaign> on any page: remember the latest referral link in
 * a first-party cookie (signup checks the program's window) and log the
 * click in the background.
 */
function trackReferral(request: NextRequest, response: NextResponse, event: NextFetchEvent, path: string) {
  const code = normalizeCode(request.nextUrl.searchParams.get("via"));
  if (!code) return;
  const campaign = normalizeCampaign(request.nextUrl.searchParams.get("c"));
  response.cookies.set(viaCookie, formatViaCookie({ code, campaign, at: new Date() }), {
    maxAge: 365 * 86_400,
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/",
  });
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) return;
  event.waitUntil(
    fetch(new URL("/api/affiliates/click", request.url), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal": secret,
        "x-visitor-ip": request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown",
        "x-visitor-agent": request.headers.get("user-agent") ?? "",
      },
      body: JSON.stringify({ code, campaign, path }),
    }).catch(() => undefined),
  );
}

export const config = {
  // Everything except API routes, Next internals, uploaded files and files with an extension;
  // plus sitemap.xml and robots.txt, so agency sites can serve their own.
  matcher: ["/((?!api|files|_next|_vercel|.*\\..*).*)", "/sitemap.xml", "/robots.txt"],
};
