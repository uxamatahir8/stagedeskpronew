# Test coverage

## Results (local, 2026-11-01, services from `docker/compose.dev.yml`, stripe-mock running)

| Suite | Files | Tests | Passed | Failed | Skipped | Baseline at `189911a` |
|---|---:|---:|---:|---:|---:|---|
| `@stagedesk/core` | 23 | 193 | 193 | 0 | 0 | 188 |
| `@stagedesk/db` | 19 | 147 | 147 | 0 | 0 | 134 |
| `@stagedesk/payments` (incl. stripe-mock contract) | 5 | 36 | 36 | 0 | 0 | 17 |
| `@stagedesk/emails` | 1 | 8 | 8 | 0 | 0 | 8 |
| `@stagedesk/web` (Better Auth API, rate limits) | 2 | 15 | 15 | 0 | 0 | 8 |
| **Total** | 50 | **399** | 399 | 0 | 0 | 355 |
| Playwright e2e (17 specs) | — | — | — | — | — | **NOT RUN** (see below) |

Other gates: `pnpm typecheck` passes (7 tasks); `pnpm lint` passes with 1 pre-existing warning; `pnpm build` passes; `prisma migrate diff --from-migrations … --exit-code` reports "No difference detected"; gitleaks finds no leaks; `pnpm audit --prod` reports 1 moderate and 1 low.

## Added tests (44)

| File | What it proves | Kind |
|---|---|---|
| `packages/db/src/booking-concurrency.test.ts` (4) | Parallel quotes don't deadlock; one answer per gig request; no artist double booking; expiry vs. acceptance | concurrency (reproduced 3 failures on the old code) |
| `packages/payments/src/financial-recovery.test.ts` (16) | Refund/payout/webhook behaviour under concurrency, lost responses, expired keys, DB failure, partial reversals, review, chargebacks, dead letters | failure injection + concurrency |
| `packages/payments/src/affiliate-promo.test.ts` (3) | Promotion code follows partner status, code change and deletion; orphan reconcile | integration (fake Stripe) |
| `packages/db/src/marketplace.test.ts` (4) | One winner; second click; resume after crash; failure half-way leaves nothing | concurrency + recovery |
| `packages/db/src/delivery-reliability.test.ts` (5) | Newsletter claims, retries, permanent failures, operator retry; reminder claim released on failure | concurrency + failure |
| `packages/core/src/config.test.ts` (5) | Production config rules | unit |
| `apps/web/src/lib/rate-limit.test.ts` (5) | Atomic window and repair (real Redis), outage fallback, proxy-aware IP | integration + failure |
| `apps/web/src/lib/staff-seats.test.ts` (+2) | Quick resend; seat check failure cancels the invitation | real Better Auth endpoints |

Concurrency tests fire operations at the same time through separate connections. They rely on the database's locks rather than injected pauses (the existing seat tests use explicit interception). Failure injection uses the fake Stripe's `failNext(method, "before" | "after")` and a one-off `prisma.$transaction` failure.

## Not covered

- **E2E not run:** port 3000 was taken by a `pnpm dev` server (started 22:20 through turbo, with a browser attached), which was not stopped. The specs hard-code `localhost:3000`, and that server was started with the regular SMTP settings, which the e2e global setup refuses. It may also predate this branch's Prisma schema changes. To run: stop it, then `pnpm dev:e2e` and `pnpm --filter @stagedesk/web e2e`.
- Real Stripe test mode, real SMTP, load and performance tests: none.
- `/api/health`, the export currency columns and the admin operation buttons: typechecked, built and lint-clean, but not exercised by an automated test.
- Affiliate withdrawal claim/remote lookup (F-09): no dedicated test.
