# Code review: findings register

Branch `feat/inventory`, reviewed from `189911a` (2026-11-01). Each finding has a stable ID used across the other audit documents and the final report.

**Status values.** *Fixed* means the code is changed and a test covers it. *Fixed (analysis)* means the hazard was found by reading the code; it is fixed but no failing test was produced first. *Open* means not fixed (see "Why"). *Unverified* means the area was not inspected.

**Severity.** P0 = demonstrated emergency. P1 = release blocker or credible high-impact integrity risk. P2 = important defect or operational debt. P3 = refinement.

## Coverage

| | Count | Inspected in depth |
|---|---:|---|
| Tracked files at start | 814 | — |
| Production TS/TSX (no tests, no generated) | 576 | ~45 (listed below) |
| Pages (`page.tsx`) | 115 | 3 (platform payments, newsletter campaign, request compare) |
| `"use server"` files | 56 | All 56 scanned by script for an auth gate; 9 read |
| API routes | 13 | 3 (Stripe webhook, export, new health) |
| Prisma models / migrations | 76 / 35 | Money, booking, lead, invitation, newsletter models; migration drift checked |
| Playwright specs | 17 | Run, not modified |

Files read in full: `packages/payments/src/{refunds,payouts,webhooks,booking-payments,affiliates}.ts`, `packages/db/src/{bookings,leads,marketplace,billing,withdrawals,newsletter,reminders,tenant,clean-test-data}.ts`, `apps/web/src/lib/{auth-config,rate-limit,turnstile,redis,system-queue}.ts`, `apps/worker/src/{index,reminders,newsletter}.ts`, `apps/web/src/app/api/{webhooks/stripe,export/[kind]}/route.ts`, `apps/web/src/app/[locale]/app/{payments,platform-payments,affiliates,team,newsletter}/actions.ts`, `.github/workflows/ci.yml`, `scripts/deploy-staging.sh` (health parts), `docker/compose.dev.yml`, Better Auth `plugins/organization/routes/crud-invites.mjs` and `context/create-context.mjs` (1.7.12).

**UNVERIFIED (not inspected in this pass):** the inventory module (`inventory.ts`, `booking-equipment.ts`, `shared-inventory.ts`, its UI and its own tests); agency websites and custom domains; content/blog/legal pages; support tickets and impersonation; authentication flows besides invitations (2FA, OTP, password reset, session revocation); subscriptions (`subscriptions.ts`) besides webhook dispatch; payment claims; artist requests and lending except through the payout path; every UI page for UX, accessibility and translations; performance.

## Findings

| ID | P | Module | Finding | Evidence (before) | Status | Test |
|---|---|---|---|---|---|---|
| F-01 | P1 | Refunds | Stripe refund created before anything was persisted; idempotency key built from the mutable `refundedCents`; no row lock. A DB failure after Stripe, or a retry after 24 h, could refund again; ledger could be booked twice | `refunds.ts` (old) l.31–34, l.70–78 | Fixed | `financial-recovery.test.ts` "database fails after Stripe refunded", "response was lost" |
| F-02 | P1 | Refunds/webhooks | `charge.refunded` arriving while our refund was being booked counted it as a dashboard refund → refunded twice locally | `refunds.ts` (old) `syncChargeRefund` | Fixed | same file, "response was lost" asserts the webhook adds 0 |
| F-03 | P1 | Money tx | Under REPEATABLE READ a plain read before `FOR UPDATE` fixed a stale snapshot: two simultaneous refunds both passed the balance check (found while fixing F-01) | reproduced: both requests fulfilled | Fixed (`moneyTx` = READ COMMITTED) | "two different refunds … at the same time" |
| F-04 | P1 | Payouts | No claim: two runs both transferred (deduped by Stripe only within 24 h) and both wrote ledger rows; a crash after a transfer re-sent it after 24 h | `payouts.ts` (old) l.61–96 | Fixed | "two payout runs overlap", "interrupted payout" |
| F-05 | P1 | Payouts | After a lost chargeback `disputed` was cleared and the full charged-back amount was paid out | `webhooks.ts` dispute handler + `payouts.ts` amount | Fixed | "money lost to a chargeback" |
| F-06 | P1 | Webhooks | No atomic claim; two workers (or web + worker) could run one event's effects at once; dispute handler not idempotent | `webhooks.ts` (old) `processStoredEvent` | Fixed | "two workers take it at the same time" |
| F-07 | P2 | Webhooks | Failed events retried every 5 min forever, no backoff, no dead-letter, no crash recovery for "processing" | worker `retry-stripe-events` | Fixed | "worker died mid-run", "backs off" |
| F-08 | P2 | Webhooks | `dispute.created` delivered after `dispute.closed` re-froze the booking | dispute handler | Fixed | "opening that arrives after its closing" |
| F-09 | P1 | Affiliate payouts | Stripe withdrawal not claimed; a retry more than 24 h after an uncertain failure could pay twice | `affiliates.ts` `payWithdrawalByStripe` | Fixed (analysis) | — (claim and remote lookup; no dedicated test) |
| F-10 | P1 | Bookings | `applyTransition` ignored the affected-row count of its conditional update; a request acting on a stale read still logged events and created quotes | `bookings.ts` (old) l.88–91 | Fixed | `booking-concurrency.test.ts` |
| F-11 | P1 | Bookings | Concurrent `sendQuote` deadlocked | reproduced: 4 of 5 parallel calls failed | Fixed (booking row lock first) | "simultaneous quotes … without deadlocking" |
| F-12 | P1 | Bookings | Two bookings on one date could take the same artist | reproduced | Fixed (artist row lock) | "same artist" |
| F-13 | P2 | Bookings | Accept and decline of one gig request could both apply | `respondToAssignment` | Fixed | "only one of two simultaneous answers" |
| F-14 | P2 | Bookings | Quote accepted during the expiry run made the run throw and stop | reproduced | Fixed | "doesn't expire a quote the customer accepts" |
| F-15 | P2 | Invoices | `issueInvoice` checked for an existing invoice before locking (RR snapshot) → two invoices possible | analysis | Fixed (analysis) | — |
| F-16 | P1 | Leads | `assignLead` committed claim, customer, booking and link separately: a crash stranded the lead; a late failure left an orphan booking and let a second agency win | `leads.ts` (old) l.130–175 | Fixed (one transaction) | `marketplace.test.ts` "fails half-way" |
| F-17 | P2 | Marketplace | Customer acceptance stopped half-way left a booking without quote; losers marked "withdrawn"; a second click errored | `marketplace.ts` (old) `acceptLeadOffer` | Fixed (resumable, worker job) | `marketplace.test.ts` (3 cases) |
| F-18 | P1 | Staff seats | `newInvitations` in-memory map: only correct when both hooks ran in one process; could mix a resend with a simultaneous new invite | `auth-config.ts` (old) l.48–60 | Fixed (reads `createdAt`) | `staff-seats.test.ts` "quick resend" |
| F-19 | P1 | Staff seats | Better Auth swallows errors from `sendInvitationEmail`; a seat check that threw left an unchecked pending invitation | Better Auth `runInBackgroundOrAwait` | Fixed (fail closed) | "seat check fails" |
| F-20 | P1 | Rate limits | INCR then EXPIRE in two calls: a counter without expiry blocked its key for good | `rate-limit.ts` (old) | Fixed (Lua, self-repairing) | `rate-limit.test.ts` "repairs" |
| F-21 | P2 | Rate limits | Redis outage → every limit open, unbounded | same | Fixed (in-memory fallback) | "still limits … when Redis is down" |
| F-22 | P2 | Rate limits | `clientIp` took the client-supplied left-most X-Forwarded-For | same | Fixed; **needs `TRUSTED_PROXIES` set in production** | "address the proxy added" |
| F-23 | P1 | CAPTCHA | Turnstile skipped silently when the secret was missing, production included; no fetch timeout | `turnstile.ts` (old) | Fixed (fail closed, 5 s) | config tests |
| F-24 | P2 | Config | No start-up validation; placeholder secrets, http URLs, Stripe mock URL accepted | — | Fixed (`checkProductionConfig`) | `config.test.ts` |
| F-25 | P1 | Reminders | Claimed before queuing: a Redis failure lost the reminder for good; one failure stopped the run | `worker/reminders.ts` (old) | Fixed | `delivery-reliability.test.ts` |
| F-26 | P2 | Newsletter | No per-delivery claim (two senders mail one person); temporary failures never retried | `newsletter.ts` (old) | Fixed | `delivery-reliability.test.ts` |
| F-27 | P1 | Affiliates | Deleting/suspending a partner left its Stripe promotion code active; a changed code orphaned the old one | `affiliates.ts`, admin actions | Fixed + daily reconcile | `affiliate-promo.test.ts` |
| F-28 | P2 | Exports | Bookings/payments CSV labelled amounts `_eur` whatever the currency | `export/[kind]/route.ts` | Fixed (currency column) | — (manual; no export test) |
| F-29 | P3 | Exports | Downloads of personal data not audited | same | Fixed | — |
| F-30 | P2 | Ops | No readiness endpoint or worker heartbeat | — | Fixed (`/api/health`) | — (manual, see test-coverage) |
| F-31 | P2 | CI | No Redis/stripe-mock (contract tests skipped silently), no build, migration check, audit, secret scan or e2e | `ci.yml` | Fixed in workflow; **not run on GitHub** | — |
| F-32 | P2 | Admin stats | Platform payments page sums payments of all currencies and shows them as EUR | `platform-payments/page.tsx` l.57–66 | Open | — |
| F-33 | P2 | Affiliates | Commissions already paid out are not clawed back after a refund or chargeback | `adjustCommissionsForCharge` filters `pending/review/approved` | Open (policy) | — |
| F-34 | P2 | Seats | If the compensation itself fails (DB down after Better Auth wrote a role), the agency can stay over its seat limit; nothing detects it | `auth-config.ts` afterUpdateMemberRole | Open | — |
| F-35 | P3 | Exports | Exports load all rows in memory | `export/[kind]/route.ts` | Open | — |
| F-36 | P3 | Deps | 1 moderate, 1 low advisory, both via the `shadcn` CLI in web's dependencies | `pnpm audit --prod` | Open | — |
