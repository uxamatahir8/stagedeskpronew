import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// The single .env lives at the repo root.
const rootEnv = new URL("../../.env", import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx src/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"] ?? "",
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
  },
});
