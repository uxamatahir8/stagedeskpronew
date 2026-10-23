# StageDesk v2

See README.md for layout, commands and conventions. Build plan: https://claude.ai/artifact/2g4KvkN7ByigdSn5Vmh2aN

- Windows dev machine; Node 22 via nvm-windows; pnpm via corepack. Docker services run from `docker/compose.dev.yml` (MySQL on 3307 because XAMPP uses 3306).
- Next.js 16 with Cache Components: read `apps/web/node_modules/next/dist/docs/` before using an API you're unsure of. Request-time data (DB reads, cookies) goes in a component under `<Suspense>` and calls `connection()` or a runtime API.
- Prisma 7: config in `packages/db/prisma.config.ts`, MySQL through `@prisma/adapter-mariadb`, client generated to `packages/db/src/generated` (gitignored; run `pnpm db:generate`). Stay on 7.x until 8.0 is stable.
- The single `.env` is at the repo root; Next, Prisma and the worker load it from there.
- Money in integer cents, percentages in basis points. Business rules in `packages/core` with Vitest tests.
- Configurable business values (fees, plans, affiliate rates) go in the settings registry, not constants.
- i18n: next-intl, Dutch default without prefix (`/app`), English under `/en`. Every user-facing string goes in both `apps/web/messages/nl.json` and `en.json` (keys are type-checked against en). Use `Link`/`useRouter` from `@/i18n/navigation`, and call `setRequestLocale` in each layout/page.
- UI: shadcn/ui (radix-nova) in `apps/web/src/components/ui`; StageDesk tokens in `globals.css` (brand purple, violet-tinted neutrals, status colours success/warning/info). Shared pieces: `PageHeader`, `StatCard`, `EmptyState`, `Pill`/`BookingStatusBadge`. Dev-only preview at `/app/ui`.
- Dashboard nav lives in `apps/web/src/config/navigation.ts`; items declare a `permission` (checked with `can()` from core) and the plan `phase` that builds them. Remove `phase` when a page is built.
- Auth: Better Auth (`apps/web/src/lib/auth-config.ts`; app code imports `@/lib/auth`). Agencies are Better Auth organizations; member roles are our role names. `platformRole` on users is never client-writable.
- Pages get the user via `lib/viewer.ts`: `requireViewer()`, `requirePermission(p)`, or `requireAgency(p)` which also returns a `tenantDb` scoped to the active agency. Use that `db` for all agency data; add new tenant models to `tenantModels` in `packages/db/src/tenant.ts` (a test enforces it).
- Prisma 7: `prisma migrate dev` doesn't regenerate the client; `pnpm db:migrate` runs both.
- Server-side form actions return `FormState` (`lib/validation.ts`); shared Dutch validators (KvK, BTW, postcode) live there.
- Smoke tests: `bash scripts/smoke-accounts.sh`, `bash scripts/smoke-bookings.sh`, `bash scripts/smoke-payments.sh`, `bash scripts/smoke-affiliates.sh`, `bash scripts/smoke-dashboards.sh`; Playwright e2e in `apps/web/e2e` (`pnpm --filter @stagedesk/web e2e`). All need services, seed and `pnpm dev`.
- Bookings: change status only via `packages/db/src/bookings.ts` (createBooking, sendQuote, acceptQuote, assignArtist, respondToAssignment, recordPayment, changeBookingStatus, issueInvoice, expireQuotes). Web actions wrap them with `runAction()` (`lib/actions.ts`) to translate `BookingError` codes.
- Cross-agency reads are explicit and rare: artist sharing (partner side filters on `partnerOrganizationId`), an artist's own gigs (filter on `artist.userId`), and public quote links (secret token). Everything else goes through `tenantDb`.
- Every export of a `"use server"` file is a public endpoint: keep helpers that take ids or db clients in server-only modules (e.g. `lib/availability.ts`).
- Public booking pages: `packages/db/src/inquiries.ts` (publicAgency, publicArtists, submitInquiry, agencyFullyBookedDates); web in `app/[locale]/(public)/b/[slug]` and `/embed/[slug]` + `public/embed.js`. Only `/embed/*` may be framed (headers in `next.config.ts`). Media links must pass core's `mediaEmbed()`.
- Pages or `generateMetadata` that hit the database or read the clock must `await connection()` first (Cache Components flags `Date.now()` during prerender; the DB driver reads it too).
- Emails: add templates to `packages/emails`, send from web via `deliver()` in `lib/mail.ts` (never awaited in the request).
- Rate limits: `allow(key, max, seconds)` in `lib/rate-limit.ts` (Redis). Running many sign-ins quickly (e.g. e2e + smoke scripts back to back) hits the 10/min sign-in limit; wait a minute.
- After `pnpm add` while `pnpm dev` runs, restart the dev server (Turbopack loses track of node_modules). Restart after `next.config.ts` or Prisma schema changes too.
- Stripe lives in `packages/payments`. `getStripe()` returns null without `STRIPE_SECRET_KEY`; every caller must handle that (show a message, skip the job). Logic tests use a fake Stripe (`src/test/fixtures.ts`); `stripe-contract.test.ts` checks request shapes against stripe-mock and skips if it isn't running.
- Money movements are append-only `LedgerEntry` rows; never update or delete them. Fee rules resolve agency deal, then plan, then platform default (`effectiveFeeSnapshot`) and are frozen on the booking when the quote is accepted.
- Plan limits: actions check `writeBlocked`, `limitBlocked` or `featureBlocked` from `lib/billing.ts` before changing anything. Buttons that send the user to Stripe use `RedirectButton` with an action returning `RedirectResult`.
- Affiliates are platform-level: `Affiliate`, `Referral`, `Commission` point at agencies with `agencyId` (not `organizationId`) so they stay out of `tenantDb`. Rules in `packages/core/src/affiliates.ts`, records in `packages/db/src/affiliates.ts`, Stripe parts in `packages/payments/src/affiliates.ts`. Referral terms are frozen on the referral at signup.
- The proxy (`src/proxy.ts`) handles `?via=` tracking; it posts clicks to `/api/affiliates/click` with the auth secret. Keep the proxy free of database imports.
- Playwright runs with one worker: the specs share demo data and the dev server.
- Emails: describe them as a job `{ kind, to, params }` (`EmailJob` in `packages/emails`) and call `deliver(job)` from `lib/mail.ts`; the worker's email queue sends them. Add a new email by adding its template, its copy in both languages and a sender to the `senders` map. Email templates carry `@jsxRuntime automatic` pragmas so the worker (tsx) renders them too.
- Notifications: call `notify(userIds, { type, data, url })` from `packages/db` (the actor is skipped). Add the type to `NotificationType` and its text to `notifications.<type>` in both message files; amounts go in `data.cents`.
- Messages: `lib/messages.ts` `messageAccess()` is the only gate for booking conversations (they're read across agencies for shared artists). Desk sees both channels, the assigned artist the artist channel, the customer the customer channel.
- Audit: call `audit({ actorId, action, ... })` for admin, money and access changes; `action` is `<group>.<verb>` and gets a label under `audit.action` in the message files.
- Charts: `components/charts/column-chart.tsx` with `var(--chart-1)`/`var(--chart-2)`. The dark chart tokens were checked with the dataviz palette validator; re-run it if you change them.
