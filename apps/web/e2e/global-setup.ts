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
  await warmUp(base);
}

/**
 * The dev server compiles each route on its first request (often 10–20 s on CI).
 * Long journeys that open many pages then spend most of their 2-minute budget
 * waiting for the compiler, not for the app. Requesting every route the specs
 * use once, before the first test, compiles them up front; a signed-out request
 * is enough (it compiles the route, then redirects to sign-in). Failures here
 * don't matter: the tests themselves check the pages.
 */
const warmRoutes = [
  "/nl", "/nl/sign-in", "/nl/sign-up", "/nl/forgot-password", "/nl/reset-password", "/nl/accept-terms", "/nl/onboarding",
  "/nl/request", "/nl/partners", "/nl/blog", "/nl/changelog", "/nl/b/feestband-utrecht", "/embed/feestband-utrecht",
  "/nl/app", "/nl/app/bookings", "/nl/app/bookings/new", "/nl/app/bookings/XXXXXXXX", "/nl/app/event", "/nl/app/gigs/XXXXXXXX",
  "/nl/app/messages", "/nl/app/messages/XXXXXXXX", "/nl/app/payments", "/nl/app/my-payments", "/nl/app/agency-settings",
  "/nl/app/settings", "/nl/app/settings/payments", "/nl/app/team", "/nl/app/artists", "/nl/app/profile", "/nl/app/support",
  "/nl/app/inventory", "/nl/app/inventory/XXXXXXXX", "/nl/app/inventory/categories", "/nl/app/inventory/packages/new",
  "/nl/app/inventory/shared", "/nl/app/bookings/XXXXXXXX/equipment", "/nl/app/lead-offers", "/nl/app/leads", "/nl/app/leads/x",
  "/nl/app/website", "/nl/app/website/domain", "/nl/app/pages", "/nl/app/pages/new", "/nl/app/content", "/nl/app/content/new",
  "/nl/app/texts", "/nl/app/emails", "/nl/app/links", "/nl/app/agencies", "/nl/app/agencies/x", "/nl/app/users",
  "/nl/app/affiliates", "/nl/app/audit", "/nl/app/admin-bookings", "/nl/app/payouts", "/nl/q/x", "/nl/invite/x",
];

async function warmUp(base: string) {
  const started = Date.now();
  for (const path of warmRoutes) {
    await fetch(new URL(path, base), { redirect: "manual", signal: AbortSignal.timeout(60_000) }).catch(() => null);
  }
  console.log(`[e2e] compiled ${warmRoutes.length} routes in ${Math.round((Date.now() - started) / 1000)} s`);
}
