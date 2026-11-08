import { existsSync } from "node:fs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// The single .env lives at the repo root, shared with the worker and Prisma.
const rootEnv = new URL("../../.env", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const production = process.env.NODE_ENV === "production";

/**
 * Content-Security-Policy for every page. Scripts and styles only from this
 * site (Next.js still needs inline scripts and styles) and Cloudflare
 * Turnstile; frames only from Turnstile and the media players mediaEmbed()
 * allows; no plugins; forms and <base> stay on this site. Images may come from
 * any https host (agency websites link their own). Development adds what hot
 * reload needs. frame-ancestors is added per route below.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${production ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "media-src 'self' https:",
  `connect-src 'self' https://challenges.cloudflare.com${production ? "" : " ws: wss:"}`,
  "frame-src 'self' https://challenges.cloudflare.com https://www.youtube-nocookie.com https://player.vimeo.com https://w.soundcloud.com https://player-widget.mixcloud.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(production ? ["upgrade-insecure-requests"] : []),
].join("; ");

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Don't advertise the framework (X-Powered-By: Next.js).
  poweredByHeader: false,
  partialPrefetching: true,
  experimental: {
    // Enables forbidden() for permission checks (403 page).
    authInterrupts: true,
    // Image uploads go through server actions; the largest action limit is 5 MB, plus multipart overhead.
    serverActions: { bodySizeLimit: "6mb" },
  },
  transpilePackages: ["@stagedesk/core", "@stagedesk/db", "@stagedesk/payments"],
  serverExternalPackages: ["@prisma/adapter-mariadb", "mariadb", "@react-pdf/renderer", "stripe"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    const common = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      // Features no page uses stay off, also for anything embedded.
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
      // Only over https (production): browsers then refuse plain http for a year.
      ...(production ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
    ];
    return [
      // Nothing may be framed by other sites (clickjacking), except the embeddable form.
      {
        source: "/:path((?!embed/|en/embed/|nl/embed/).*)",
        headers: [...common, { key: "X-Frame-Options", value: "SAMEORIGIN" }, { key: "Content-Security-Policy", value: `${contentSecurityPolicy}; frame-ancestors 'self'` }],
      },
      { source: "/:lang(en|nl)?/embed/:slug", headers: [...common, { key: "Content-Security-Policy", value: `${contentSecurityPolicy}; frame-ancestors *` }] },
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
