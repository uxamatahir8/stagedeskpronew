import { existsSync } from "node:fs";
import type { NextConfig } from "next";

// The single .env lives at the repo root, shared with the worker and Prisma.
const rootEnv = new URL("../../.env", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  transpilePackages: ["@stagedesk/core", "@stagedesk/db"],
  serverExternalPackages: ["@prisma/adapter-mariadb", "mariadb"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
