# Feature gap analysis

What was added in this pass, and what a commercial release still needs. Classes: **E** production essential, **C** commercial enhancement, **O** optional / enterprise. Nothing here sets pricing, refund terms, tax treatment or retention periods. Where one of those is needed, the decision is named.

## Added (implemented and tested)

| Feature | Class | Who | Where |
|---|---|---|---|
| Durable refunds and payouts with operator recovery (retry, book with shortfall) | E | Platform admin | `operations.ts`, Platform → Payments & payouts |
| Webhook retry with backoff, dead-letter and replay | E | Platform admin | `webhooks.ts`, same page |
| Resumable marketplace acceptance (worker) | E | — | `marketplace.ts`, worker `resume-lead-acceptances` |
| Newsletter: retries for temporary failures, "Retry failed" for operators | E | Platform admin | `newsletter.ts`, campaign page |
| Affiliate promotion-code reconciliation (daily) | E | — | worker `affiliate-promos` |
| Production config check (start-up + `scripts/check-env.mjs`) | E | Ops | `core/config.ts` |
| `/api/health` readiness and monitoring report | E | Ops | `app/api/health/route.ts` |
| Export auditing | C | Platform admin | audit log group "Data" |

## Still missing

| Gap | Class | Missing decision / work | Notes |
|---|---|---|---|
| Commission clawback after refund/chargeback of a paid commission | E | **Business decision:** deduct from next payout, write off, or invoice the partner | F-33 |
| Full Stripe ↔ ledger reconciliation report (balance transactions) | E | Design in `operations/financial-reconciliation.md`; needs Stripe test keys to build and verify | |
| Per-currency platform stats | C | Group by `booking.currency` or convert with stored rates; choose which | F-32 |
| Seat over-limit detection after a failed compensation | C | Admin list of agencies over `maxStaff`, with the owner told; who is demoted stays with the owner | F-34 |
| Streaming/paginated exports for large agencies | C | Stream rows (cursor) instead of loading all | F-35 |
| Equipment maintenance schedules, service history, stock alerts, QR labels | C | Inventory module not reviewed in this pass | UNVERIFIED |
| Website version history / rollback | C | Not reviewed | UNVERIFIED |
| Notification preferences for non-essential email | C | Needs the list of email kinds that are optional (legal input for marketing vs. transactional) | |
| Data portability / account anonymisation | E (GDPR) | **Retention periods** for bookings, invoices (Dutch fiscal 7 years) and messages must be set by the business | |
| Calendar (iCal) feed for artists | O | | |
| Public API / outgoing webhooks | O | | |
