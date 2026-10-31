import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against the local app with demo data (`pnpm db:seed`).
export default defineConfig({
  testDir: "./e2e",
  // Refuses to run unless the app is local, mails to Mailpit and uses a local database.
  globalSetup: "./e2e/global-setup.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // The specs share demo data and one dev server; in parallel, slow first compiles time out.
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Mail to Mailpit, whatever SMTP the root .env configures.
    command: "pnpm --dir ../.. dev:e2e",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
