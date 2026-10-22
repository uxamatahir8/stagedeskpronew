import { existsSync } from "node:fs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// The single .env lives at the repo root, shared with the worker and Prisma.
const rootEnv = new URL("../../.env", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Enables forbidden() for permission checks (403 page).
    authInterrupts: true,
  },
  transpilePackages: ["@stagedesk/core", "@stagedesk/db"],
  serverExternalPackages: ["@prisma/adapter-mariadb", "mariadb", "@react-pdf/renderer"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
