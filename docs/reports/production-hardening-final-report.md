# Production hardening: final report

Written for an independent reviewer (e.g. ChatGPT) who will check the changes against the source. Every claim points at a file, test or command. Findings IDs (F-xx) are defined in `docs/audits/complete-code-review.md`.

## A. Executive summary

- **Initial assessment:** not production-ready. Money operations could be duplicated or lost under retries and races. Booking transitions could act on stale state and deadlocked under concurrency. Lead assignment could be left half done. Staff-seat checks relied on process memory. Rate limiting, CAPTCHA and reminders could fail unsafely.
- **Final assessment:** **NO-GO**. The defects found are fixed and tested, but several release gates were not verified (browser suite, CI on GitHub, Stripe test mode, backups, monitoring), and large modules were not reviewed (inventory, websites, auth flows other than invitations, subscriptions, UI/accessibility).
- Findings logged: **36**. Fixed: **31** (27 with a test or reproduced first; F-09, F-15, F-28, F-29, F-30 by analysis/manual). Open: **5** (F-32…F-36).
- Features added: **8** (table D). Improvements: table E.
- Tests: 355 → **399** (+44), 0 failed, 0 skipped. E2E not run.

## B. Repository inspection coverage

- Branch `feat/inventory`. Initial commit `189911a`. Final commit: the commit that adds this report (`git log -1`).
- 814 tracked files at start; 576 production TS/TSX files. About 45 were read in full (list in `complete-code-review.md` → Coverage); all 56 `"use server"` files were scanned by script. **56 files changed** (+~3,100 / −~480 lines before docs).
- **Not inspected (UNVERIFIED):** inventory module, agency websites/domains, content/legal pages, support/impersonation, 2FA/OTP/password/session flows, subscription logic, payment claims, all pages for UX/a11y/i18n, performance. Coverage is **not** 100%.

## C. Bug-fix register (summary; detail and file/line evidence in `complete-code-review.md`)

| ID | P | Module | Problem → fix | Files | Tests | Status |
|---|---|---|---|---|---|---|
| F-01/02/03 | P1 | Refunds | Stripe before DB, keys from balances, no lock, webhook double count, stale RR snapshot → reserve-then-call-then-book operation, READ COMMITTED, in-flight-aware sync | `payments/src/{operations,refunds}.ts`, schema | `financial-recovery.test.ts` | Fixed |
| F-04/05 | P1 | Payouts | Overlapping runs duplicated ledger, >24 h retries could re-transfer, charged-back money paid out → one operation per payment, dispute net subtracted | `payouts.ts` | same | Fixed |
| F-06/07/08 | P1/P2 | Webhooks | No claim, no backoff/dead-letter, out-of-order disputes → leased claim, backoff, dead, replay, idempotent disputes | `webhooks.ts`, worker | same | Fixed |
| F-09 | P1 | Affiliate payouts | No claim / >24 h duplicate → `processing` claim, remote lookup by `payoutId` | `payments/src/affiliates.ts`, `db/src/withdrawals.ts` | — | Fixed (analysis) |
| F-10…F-15 | P1/P2 | Bookings | Unchecked conditional update, deadlock, double booking, double answer, expiry race, duplicate invoice → booking row lock first, count checked, artist lock, re-checks | `db/src/bookings.ts` | `booking-concurrency.test.ts` | Fixed |
| F-16/17 | P1/P2 | Leads | Half-done assignment, orphan booking, half-done acceptance → one transaction, resumable completion + worker | `db/src/{leads,marketplace}.ts` | `marketplace.test.ts` | Fixed |
| F-18/19 | P1 | Staff seats | Process-local map, swallowed errors → `createdAt` signal, fail closed | `web/src/lib/auth-config.ts` | `staff-seats.test.ts` | Fixed |
| F-20…F-24 | P1/P2 | Security | Non-atomic limiter, unbounded fail-open, spoofable IP, CAPTCHA skip, no config check → Lua limiter, memory fallback, `TRUSTED_PROXIES`, fail closed, `checkProductionConfig` | `rate-limit.ts`, `turnstile.ts`, `core/src/config.ts`, `instrumentation.ts` | `rate-limit.test.ts`, `config.test.ts` | Fixed |
| F-25/26 | P1/P2 | Worker | Reminders lost on queue failure; newsletter duplicate sends, no retry → claim released, delivery lease + backoff + operator retry | `worker/src/*`, `db/src/{reminders,newsletter}.ts` | `delivery-reliability.test.ts` | Fixed |
| F-27 | P1 | Affiliates | Promo codes outlive partners → sync to status, retire on delete, daily reconcile | `payments/src/affiliates.ts` | `affiliate-promo.test.ts` | Fixed |
| F-28/29 | P2/P3 | Exports | EUR labels, no audit → currency column, `data.export` audit | `api/export/[kind]/route.ts` | — | Fixed |
| F-30/31 | P2 | Ops/CI | No health check; CI gaps → `/api/health`, heartbeat, CI gates | `api/health/route.ts`, `ci.yml` | — | Fixed (CI not run) |

## D. New features

| Feature | Why | Config | Permission | Tests |
|---|---|---|---|---|
| Operator view for stuck refunds/payouts (retry, book with shortfall) | Recovery without DB access | — | `platform.payments`, audited | recovery tests (logic) |
| Stripe event replay incl. dead events | Dead-letter recovery | — | `platform.payments`, audited | webhook tests |
| Newsletter "Retry failed" | SMTP outage recovery | — | `platform.newsletter`, audited | delivery tests |
| Worker jobs: `financial-operations`, `resume-lead-acceptances`, `affiliate-promos` | Durable recovery | — | — | via functions |
| `/api/health` (+ token report) | Readiness, monitoring | `HEALTH_TOKEN` | token | manual |
| Start-up config check + `scripts/check-env.mjs` | Unsafe config never serves | `TURNSTILE_DISABLED`, `TRUSTED_PROXIES` | — | `config.test.ts` |
| Export audit, currency column | Privacy, correctness | — | existing | — |

## E. Existing features improved

Refund dialog (one request id per opening; pending/in-progress/refused messages). Withdrawal status "processing". Team invite error when the seat check fails. Marketplace second click returns the same success. Webhook retry every minute with backoff instead of every 5 minutes without.

## F. Financial integrity

See `docs/audits/financial-integrity-review.md` (design, 15 scenarios with evidence). Not tested: real Stripe test mode, affiliate withdrawal recovery (F-09). Remaining: F-32, F-33, no full balance-transaction reconciliation, ledger immutability not enforced in the DB. Ledger checks on the dev DB returned 0 mismatches (188 payments, none refunded: weak evidence).

## G. Security

See `docs/audits/security-review.md`. Server actions: no unguarded export found. Audit: 1 moderate, 1 low (shadcn chain). Secret scan: clean. Remaining risks: `TRUSTED_PROXIES` must be set; F-34; headers/CSP, uploads, SSRF, and the auth flows other than invitations were not reviewed.

## H. Module matrix

| Module | Production status after this pass |
|---|---|
| Refunds, payouts, webhooks | Hardened and tested; needs Stripe test-mode run |
| Bookings (state, quotes, assignment) | Concurrency hardened and tested |
| Leads/marketplace | Hardened and tested |
| Staff seats/invitations | Hardened, tested via real endpoints |
| Affiliates | Promo codes fixed; clawback open |
| Newsletter/reminders | Hardened and tested |
| Inventory | **UNVERIFIED** (existing tests pass) |
| Websites/domains, content, support, subscriptions, auth flows | **UNVERIFIED** |
| UI/a11y/i18n | **UNVERIFIED** beyond new strings |

## I. Configuration

New environment settings: `TRUSTED_PROXIES` (int, default 0; production warning), `TURNSTILE_DISABLED` (`true` to opt out; default fail closed), `HEALTH_TOKEN` (optional). Production rules are in `core/src/config.ts`. No business settings were added to the settings registry. Retry limits (8 operation attempts, 10 webhook attempts, 4 newsletter attempts) are code constants, deliberately not tenant-configurable.

## J. Database and architecture

Migrations (additive, backward compatible; `migrate diff` clean):

- `20261101090000_financial_operations`: table `financial_operations` (unique `key`); `ledger_entries.operationId` + unique `(operationId,type,party)` + index `stripeObjectId`; `stripe_events.attempts/nextAttemptAt/lockedUntil` + index.
- `20261101120000_newsletter_delivery_retries`: `newsletter_deliveries.attempts/nextAttemptAt/lockedUntil`.

Transaction changes: booking row lock first in every booking operation; money transactions at READ COMMITTED; `assignLead` single tenant transaction. Refactor: `insertBooking`, `resolveBookingCustomerTx` (transactional halves; old functions unchanged for callers). Both migrations were applied to the local dev database with `migrate deploy` (no reset).

## K. Test results

See `docs/audits/test-coverage.md`. 399/399 passed, 0 skipped. Commands run: `pnpm test --concurrency=1`, `pnpm typecheck`, `pnpm lint`, `NODE_ENV=production pnpm build`, `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code`, gitleaks (docker), `pnpm audit --prod`. Not run: `pnpm install --frozen-lockfile` (dependencies unchanged), Playwright.

## L. Performance

No load testing was done. Indexes added for the new queries (`stripe_events(status,nextAttemptAt)`, `financial_operations(status,nextAttemptAt)`, `ledger_entries(stripeObjectId)`). The new booking row lock serialises operations on one booking only. Known risk: unbounded exports (F-35).

## M. DevOps

CI `check` now has Redis and stripe-mock, a migration drift check, and a build; new `security` and `e2e` jobs; staging deploy needs `check` + `security`. None of this has run on GitHub yet. See `docs/operations/*` for deployment, backups (proposed RPO 15 min / RTO 2 h), monitoring, reconciliation and incidents. The staging deploy health check still fetches `/sign-in`; switching it to `/api/health` is recommended (not changed, as it touches the live staging deploy).

## N. Remaining problems

| Issue | Sev | Why not fixed | Impact | Required work | Blocker |
|---|---|---|---|---|---|
| E2E suite not run | P1 gate | Port 3000 used by your dev server; not stopped | Browser regressions unknown | `pnpm dev:e2e` + e2e | Yes |
| Modules not reviewed (inventory, sites, auth flows, subscriptions, UI) | P1 gate | Time; prioritised money/concurrency | Unknown defects | Same review method | Yes |
| CI not run on GitHub | P2 | No push authorised | Workflow may need fixes | Push branch | Yes |
| Stripe test mode not exercised | P1 gate | No keys | Real API behaviour unverified | Staging run | Yes |
| F-33 commission clawback | P2 | Business policy | Partner keeps commission on refunded revenue | Decide policy | Decision |
| F-32 mixed-currency stats | P2 | Needs a display decision | Misleading admin totals | Group by currency | No |
| F-34 seat over-limit after failed compensation | P2 | Needs product decision on remedy | Rare over-limit | Detection list | No |
| F-35 unbounded exports | P3 | Not demonstrated | Memory on huge agencies | Streaming | No |
| F-36 2 dependency advisories | P3 | Dev CLI chain | Low | Move `shadcn` to devDependencies | No |
| Backups/monitoring/incident owner | gate | No infra access | No recovery assurance | Operator | Yes |

## O. Git and delivery

Directory `D:\dev\stagedesk`, branch `feat/inventory`, from `189911a`. Commits: `22c214c`, `62b5391`, `b300d14`, `6fd2fa4`, `b499ed6`, `f0f2800`, `e4d13c5`, `7f32cb2`, plus the docs commit. Nothing pushed, merged or deployed. No branch or worktree created. Working tree clean after the docs commit.

## P. Verdict

**NO-GO — Not production ready.** The defects found are fixed with evidence. The release-assurance gates above are unverified, and several modules are unreviewed.

## INDEPENDENT CHATGPT REVIEW HANDOFF

1. Repo `uxamatahir8/stagedeskpronew`, branch `feat/inventory`, base `189911a`.
2. Final SHA: `git log -1` (docs commit on top of `7f32cb2`).
3. Commits: see O. Review them in order; each message explains the before and after.
4. Changed files: `git diff --stat 189911a HEAD`.
5. **Highest risk to scrutinise:**
   - `packages/payments/src/{operations,refunds,payouts,webhooks}.ts`: state machine, claim and lease logic, `moneyTx`, `lockPayment` lock order (booking → payment).
   - `packages/db/src/bookings.ts` `loadBooking` (now `FOR UPDATE` on every call; check every caller tolerates the lock and that no plain read precedes it in a REPEATABLE READ transaction).
   - `packages/db/src/leads.ts` `assignLead` (tenant transaction touching non-tenant models).
   - `apps/web/src/lib/auth-config.ts` `isNewInvitation` (2-minute window assumption).
6. Before/after: `complete-code-review.md` (Evidence column).
7. Migrations: section J.
8. Auth changes: invitations only (F-18/19); Turnstile/rate limit (F-20…23).
9. Financial changes: `financial-integrity-review.md`.
10. Worker: new jobs `financial-operations` (2 min), `resume-lead-acceptances` (5 min), `affiliate-promos` (daily); `retry-stripe-events` every 1 min; heartbeat key.
11. Features: section D.
12. Tests: `pnpm test`; focused suites: `financial-recovery`, `booking-concurrency`, `marketplace`, `delivery-reliability`, `affiliate-promo`, `staff-seats`, `rate-limit`.
13. Limitations, risks and items to verify independently: section N.
14. Recommendation: NO-GO until the gates in N pass.

**Short copyable summary:** StageDesk `feat/inventory` from `189911a`: 8 commits and docs. Fixed 31 findings: durable reserve → Stripe → book operations for refunds and payouts (idempotent, resumable, operator review); webhook leases, backoff and dead-letter; booking row locks (concurrent `sendQuote` deadlock and artist double-booking reproduced, then fixed); single-transaction lead assignment with resumable marketplace acceptance; staff seats without process memory, failing closed; atomic rate limits with outage fallback; CAPTCHA and production config fail closed; reminders no longer lost; newsletter claims and retries; promo codes follow partners; currency-correct exports; `/api/health`; CI gates. 399/399 tests, build, lint, typecheck and migration drift pass. E2E, GitHub CI, Stripe test mode, backups and monitoring are NOT VERIFIED; inventory, websites, auth flows, subscriptions and UI are not reviewed. Verdict: NO-GO.
