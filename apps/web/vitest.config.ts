import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    // Server code only, against the same stagedesk_test database as @stagedesk/db (migrated fresh per run).
    include: ["src/**/*.test.ts"],
    globalSetup: ["../../packages/db/src/test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
  },
});
