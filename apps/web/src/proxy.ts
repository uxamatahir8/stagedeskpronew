import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);

// Optimistic check only: pages verify the session for real (lib/viewer.ts).
const protectedPrefixes = ["/app", "/onboarding"];

export default function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const prefix = pathname === "/en" || pathname.startsWith("/en/") ? "/en" : "";
  const path = pathname.slice(prefix.length) || "/";

  const needsSession = protectedPrefixes.some((p) => path === p || path.startsWith(`${p}/`));
  if (needsSession && !getSessionCookie(request)) {
    const url = new URL(`${prefix}/sign-in`, request.url);
    url.searchParams.set("next", `${path}${search}`);
    return NextResponse.redirect(url);
  }
  return intl(request);
}

export const config = {
  // Everything except API routes, Next internals, uploaded files and files with an extension.
  matcher: "/((?!api|files|_next|_vercel|.*\\..*).*)",
};
