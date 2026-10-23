import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Runs against a separate stagedesk_test database, migrated fresh per run.
    globalSetup: ["./src/test/global-setup.ts"],
    fileParallelism: false,
    // Multi-step flows against MySQL; slow when the whole repo is tested in parallel.
    testTimeout: 30_000,
  },
});
