/**
 * Refuses to run the e2e tests anywhere they could reach real people or real
 * data: the app must be local, send mail to Mailpit and use a local database.
 * Start it with `pnpm dev:e2e` (mail to Mailpit whatever .env says).
 */
export default async function globalSetup() {
  const base = process.env["E2E_BASE_URL"] ?? "http://localhost:3000";
  const host = new URL(base).hostname;
  if (!["localhost", "127.0.0.1"].includes(host)) {
    throw new Error(`E2E tests only run against a local app, not ${host}.`);
  }
  const response = await fetch(new URL("/api/dev/e2e-check", base)).catch(() => null);
  if (!response?.ok) throw new Error("The app's e2e check failed. Is the dev server (pnpm dev:e2e) running?");
  const check = (await response.json()) as { mailLocal: boolean; databaseLocal: boolean };
  if (!check.databaseLocal) throw new Error("The app uses a database that isn't on this machine. E2E tests write data; stop.");
  if (!check.mailLocal) {
    throw new Error("The app sends mail through a real SMTP server. Stop the dev server and start it with `pnpm dev:e2e` so test mail goes to Mailpit.");
  }
}
