import { getSessionCookie } from "better-auth/cookies";
import { type NextFetchEvent, NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { formatViaCookie, normalizeCampaign, normalizeCode, viaCookie } from "@stagedesk/core";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);

// Optimistic check only: pages verify the session for real (lib/viewer.ts).
const protectedPrefixes = ["/app", "/onboarding", "/accept-terms"];

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname, search } = request.nextUrl;
  const prefix = pathname === "/en" || pathname.startsWith("/en/") ? "/en" : "";
  const path = pathname.slice(prefix.length) || "/";

  const needsSession = protectedPrefixes.some((p) => path === p || path.startsWith(`${p}/`));
  if (needsSession && !getSessionCookie(request)) {
    const url = new URL(`${prefix}/sign-in`, request.url);
    url.searchParams.set("next", `${path}${search}`);
    return NextResponse.redirect(url);
  }
  const response = intl(request);
  trackReferral(request, response, event, path);
  return response;
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
  // Everything except API routes, Next internals, uploaded files and files with an extension.
  matcher: "/((?!api|files|_next|_vercel|.*\\..*).*)",
};
