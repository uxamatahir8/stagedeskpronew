# Financial reconciliation

## Daily check (operator, 5 minutes)

1. Platform → Payments & payouts → "Refunds and payouts needing attention". Should be empty.
2. Stripe events filtered on "Failed" and "Gave up". Should be empty or explained.
3. `/api/health` alerts. Should be empty.

## An operation in "Needs review"

The operation shows its kind, amount, agency, booking and last error.

- **Retry now.** Resets the attempt budget and runs it again with the same Stripe keys. Before creating anything, Stripe is searched for objects tagged with the operation id. Use this after fixing the cause: Stripe keys, a connected account without balance, or a temporary outage.
- **Book with shortfall** (refunds only, once the customer's refund went through). Books the refund now and records the transfer reversal that couldn't be made as `reversal_shortfall` (platform cost). Then settle the amount with the agency or artist outside Stripe.
- A refund in review **without** a Stripe refund id: nothing was refunded as far as we know. Look the payment intent up in the Stripe dashboard (`metadata.operationId`). If a refund exists, Retry picks it up; if not, Retry creates it.

Everything is audited (`payment.operation_retried`, `payment.operation_closed`, `payment.event_replayed`).

## Ledger checks (SQL)

```sql
-- Payment refundedCents must equal the refunds in the ledger (per payment)
SELECT p.id, p.refundedCents, COALESCE(SUM(l.amountCents),0) AS ledger
FROM payments p LEFT JOIN ledger_entries l ON l.paymentId = p.id AND l.type = 'refund'
WHERE p.kind <> 'refund' GROUP BY p.id HAVING p.refundedCents <> ledger;

-- Booking paidCents must equal payments minus what was refunded of them
-- (offline refunds also add a negative "refund" row; it's skipped here so they don't count twice)
SELECT b.id, b.paidCents, SUM(CASE WHEN p.kind <> 'refund' THEN p.amountCents - p.refundedCents ELSE 0 END) AS expected
FROM bookings b JOIN payments p ON p.bookingId = b.id GROUP BY b.id HAVING b.paidCents <> expected;

-- Each completed payout operation has exactly one transfer row per party it planned
SELECT o.id FROM financial_operations o
WHERE o.kind = 'payout' AND o.status = 'completed'
  AND (SELECT COUNT(*) FROM ledger_entries l WHERE l.operationId = o.id AND l.type = 'transfer') <> JSON_LENGTH(o.data, '$.transfers');
```

These queries haven't been run against production data.

## Not built yet: Stripe ↔ ledger report

Proposal: a daily job that lists Stripe balance transactions (`charge`, `refund`, `transfer`, `transfer_reversal`, `adjustment` for disputes) for the previous day. It would match each to a ledger row by `stripeObjectId`, and list unmatched items on both sides in the admin. This needs Stripe test-mode keys to build and verify. Until then, "Retry" plus the queries above are the tools.
