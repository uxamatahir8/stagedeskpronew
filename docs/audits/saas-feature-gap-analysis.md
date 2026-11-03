# SaaS feature gap analysis (after the client-feedback branch)

Classification: **P0** critical defect · **P1** production blocker · **P2** important
for a complete product · **P3** optional. Only gaps observed in the code are listed;
items closed on this branch are in `client-feedback-review.md`.

## Open gaps

| # | Gap | Evidence | Class | Proposal |
|---|---|---|---|---|
| G1 | Sending customer mail from the agency's own domain | `packages/emails/src/index.ts` sends everything through one SMTP account and `MAIL_FROM`; there is no DNS/DKIM verification flow | P2 | Move customer mail to a provider with a domain API (Postmark, SES, Mailgun): store the agency domain, show the DNS records (SPF include, DKIM CNAMEs, DMARC), poll verification, and only then use `info@agency.nl` as From. Keep the current "<agency> via StageDesk" fallback. Needs a provider decision and credentials. |
| G2 | Credit notes / invoice corrections | Invoices are immutable (good), but there is no credit-note document; refunds only change payments | P1 for Dutch invoicing once refunds happen after an invoice | A `CreditNote` row referencing the invoice, numbered in the same series (or a `C` prefix series), negative lines from the invoice snapshot, PDF with the same template. Requires accountant input on numbering. |
| G3 | Fixed artist fee when the booking total later changes | Assignment snapshots the fee; a re-quote after assignment keeps the fee (by design) | P3 | Show a notice on the booking when the quote changes after an artist with a fixed fee was assigned. |
| G4 | Defect lifecycle beyond available/maintenance/defective | Status + event history only; no repair cost, supplier or expected-back date | P3 | Optional `repair` fields on the defect event data, and a "back expected" date shown on availability. |
| G5 | Notification preferences per user | Every notification goes to all desk users (`agencyDeskUserIds`) | P2 | Per-user, per-type opt-out for in-app and email, defaulting to today's behaviour. |
| G6 | Email deliverability operations | Booking mail is visible and retryable, with fenced leases and suppression state, but there is no provider webhook ingestion for bounce/complaint events | P2 | Persist provider events, display bounce/complaint reasons, suppress bad recipients, and expose queue/delivery SLO metrics. |
| G7 | Booking data import | Exports exist (`ExportButton`), no import | P3 | CSV import for customers and equipment with a dry run. |
| G8 | Stale gig links after withdrawal | An old `gig_request` notification links to `/app/gigs/<code>`, which 404s after the artist was taken off | P3 | Show "this request was withdrawn" instead of 404 for the artist's own withdrawn assignments. |
| G9 | Cancellation policy / payment schedule beyond deposit + balance | `amountDue` knows deposit then balance only | P2 | Payment schedule rows (e.g. 30 % / 70 % / due dates) generalising the deposit rule added here. Needs product decision. |

## Decisions the business must make

1. Fixed artist fee when a booking is paid partly offline: this branch pays the Stripe-paid share of the fee through Stripe (same proportional rule as percentages) and leaves the rest to the agency. If agencies expect the full fixed fee from the first Stripe money, change `artistCutOfPayment`.
2. Whether typed invoice numbers should be allowed at all once a series is in use (currently: allowed per agency, off by default, audited).
3. Whether the customer details link should also work on booked bookings (currently not, to protect what was agreed).
