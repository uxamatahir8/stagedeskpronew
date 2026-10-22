import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Same separate test database as @stagedesk/db, migrated fresh per run.
    globalSetup: ["../db/src/test/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
