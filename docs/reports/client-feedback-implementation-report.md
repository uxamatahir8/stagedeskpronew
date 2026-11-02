# Client feedback implementation report

Branch `feat/client-feedback-production-hardening`, created from `origin/staging` at
`1c604685229785ef8c99fb6f5a6cab1e8acf86f7` (PR #6 merged). Not pushed, not merged, not
deployed. Per-item root causes: `docs/audits/client-feedback-review.md`.

## Database changes

One additive migration, `20261103090000_client_feedback` (named to sort after the
latest staging migration):

| Table | Change | Default for existing rows |
|---|---|---|
| `artists` | `compensationType` (percentage/fixed), `defaultFixedFeeCents` | percentage, null |
| `booking_assignments` | `compensationType`, `fixedFeeCents` (snapshot) | percentage, null |
| `quotes` | `depositType` (none/percentage/fixed), `depositFixedCents`, `locale` | percentage, null, null |
| `organizations` | `correspondenceLocale`, `defaultDeposit*`, `invoiceNumbering`, `invoicePrefix`, `allowManualInvoiceNumbers`, `invoiceTemplate`, `emailFromName`, `emailReplyTo` | nl, null, yearly, null, false, null |
| `invoices` | `number` VARCHAR(16→32), `manualNumber` | false |
| `booking_detail_requests` | new (hashed token, snapshot, expiry, revoke, submit) | — |

CHECK constraints: compensation type and non-negative fixed fee (a fixed assignment
must carry an amount); deposit type, non-negative fixed deposit and `0 ≤ depositCents ≤
totalCents`; numbering scheme. Verified on a freshly recreated test database (all 39
migrations apply). Rollback: drop the new table and columns; no existing column changes
meaning except the widened `invoices.number`.

Historical compatibility: old assignments read as percentages (`compensationOf`), old
quotes as percentage deposits (`depositRuleOf`), old invoices print with the default
template and Dutch unless `?lang`; existing invoice numbers unchanged and the yearly
counter keeps counting.

## Financial rules

- **Percentage pay**: unchanged (test asserts identical results).
- **Fixed pay**: the fee is spread over the booking's Stripe payments in proportion to
  the payment (fee × payment ÷ booking total), minus what earlier and still-pending
  payouts gave the artist, capped at what the payment has left after the platform fee
  (and Stripe's fee when the agency carries it). What can't be paid is booked
  `owed_by_agency` for the artist. Same idempotent payout operations; refunds use the
  existing proportional reversal of what was transferred.
- **Cross-agency lending**: unchanged (lent artists' own share stays 0; lender fee from
  the agency share). A shared artist's default fixed fee is only copied onto bookings in
  the artist agency's currency; otherwise the agency must enter the amount.
- **Deposits**: none / percentage / fixed (≤ total). Checkout already skipped a zero
  deposit. Stored per quote; copied to the booking on acceptance as before.
- **Invoice numbers**: yearly or continuous series with prefix; typed numbers only when
  the agency allows it, by owners/admins, unique per agency (index, race-tested),
  audited; the counter skips numbers that were typed.

## Commits

```
5832fbe test(e2e): stable specs against kept demo data; platform artists renders under Suspense
7cdf395 fix(forms): keep typed input after a refused save; read the details form from the DOM
ac1f5d2 fix(mail): receipts follow the booking's language and are signed by the agency; e2e for client feedback
890f26b feat(bookings): private link for the customer to fill in event details
f56251a feat(support): manage and remove artists from the platform, log in as artist, resend confirmation
ada8da2 feat(equipment): equipment on the booking page and a loading checklist for the DJ
50a16e5 feat(inventory): add identical serialised devices at once; report defects from the list
2a07756 feat(calendar): add a booking from the agenda on the chosen day
ad7c75f feat(invoices): numbering, typed numbers, own paper and customer-mail settings
dd12769 feat(artists): fixed fee or percentage pay in the artist form, per booking and in earnings
b692ee9 fix(artists): email and notify artists about requests, removals and cancellations
db93913 feat(quotes): complete quote email in the right language, signed by the agency
deee28e feat(bookings): upfront payment kinds, fixed artist fees and agency invoice numbering
```

## Unresolved business decisions

1. Fixed fee on bookings paid partly offline (see the gap analysis, decision 1).
2. Whether typed invoice numbers should exist at all; and credit notes (gap G2).
3. Own-domain email sending: provider choice and DNS verification (gap G1).
4. Whether the details link should work after a quote is accepted.
