# Financial integrity review

Scope: refunds, payouts, Stripe webhooks, disputes, affiliate withdrawals and promotion codes. Findings F-01…F-09, F-27, F-33 in `complete-code-review.md`.

## Design now in place

**Durable operations** (`packages/payments/src/operations.ts`, table `financial_operations`). Every refund and payout goes through the same steps:

1. **Reserve.** A transaction locks the booking and then the payment (`lockPayment`, same order as `recordPayment`), checks the balance at READ COMMITTED (`moneyTx`), refuses if another refund or payout of that payment is open, and creates the operation. The operation's identity is `refund:<org>:<requestId>` (one per refund dialog) or `payout:<paymentId>`.
2. **Call Stripe** outside any transaction. Keys come from the operation id (`refund-op-<id>`, `reversal-op-<id>-<party>`; payouts keep `payout-<payment>-<party>`), never from a balance. Each result is stored on the operation as it arrives. On a retry Stripe is searched first for an object tagged `metadata.operationId`, so recovery also works after Stripe's 24-hour key window.
3. **Book once.** One transaction flips the operation `pending → completed` with a conditional update and writes the ledger, payment and booking. The ledger also has a unique key on `(operationId, type, party)`.

**Failures.** A definite Stripe refusal before money moved ends the operation as `failed` and releases the reservation. Anything uncertain (timeout, 5xx, crash, DB error) leaves it `pending`. The worker's `financial-operations` job continues it with backoff (1, 2, 4 … min, max 2 h). After 8 attempts it goes to `review`. Operators see `review` and long-pending operations under **Platform → Payments & payouts**. They can retry, or book a refund whose transfer reversal can't be made, with the gap recorded as `reversal_shortfall`.

**Webhooks.** Events are stored once by id (unchanged). Processing now claims the event with a 5-minute lease (`status → processing`). Failures back off (1 min to 6 h); after 10 attempts the event is `dead`. A dead event can be replayed (audited). A "processing" event whose lease ran out is picked up again. The dispute handler books each outcome once per dispute, and ignores an opening that arrives after the close.

**Webhook vs. in-flight refund.** `syncChargeRefund` locks the payment and subtracts refunds still being booked, so a `charge.refunded` arriving mid-refund adds nothing.

**Chargebacks.** Payout amounts subtract disputes that are open or lost (ledger `dispute` + `dispute_won/lost` net).

## Scenarios

| Scenario | Result | Evidence |
|---|---|---|
| Two simultaneous refunds of one payment (total > refundable) | One refund, one refused | test, reproduced failing before the READ COMMITTED fix |
| Same refund request twice (double click) | One Stripe refund; both answers report it | test |
| Stripe refunded, response lost, key expired | Continued by worker, found via metadata, booked once | test |
| DB failure after Stripe refund | Pending, booked by worker | test (injected `$transaction` failure) |
| Stripe refuses refund | Failed, reservation released, new refund possible | test |
| One reversal succeeds, other fails | Only the missing reversal is made | test |
| Reversal keeps failing | `review`; operator books with shortfall | test |
| Two payout runs at once | One set of transfers and ledger rows | test |
| Payout interrupted mid-way, key expired | Continued, no duplicate transfer | test |
| Refund and payout of one payment at once | Serialised; artist keeps 40 % of the net to within 2 cents | test |
| Lost chargeback before payout | Nothing transferred | test |
| Same webhook processed by three workers | Effects once | test |
| Out-of-order dispute events | Booking not re-frozen | test |
| Worker crash during an event | Re-processed after the lease | test |
| Affiliate withdrawal retried after uncertain failure | Claim + remote lookup by `payoutId` | **not tested** (analysis) |
| Real Stripe test mode end to end | — | **NOT VERIFIED** (no Stripe test keys here; stripe-mock contract tests only check request shapes) |

## Remaining financial risks

- **F-33** Commissions already paid out are not reversed after a refund or chargeback. This needs a business decision: claw back from the next payout, write off, or invoice the partner.
- **F-32** The platform payments stats add up amounts in different currencies as euros. This is a display problem only; the ledger itself is per booking currency.
- Affiliate withdrawals are always in EUR (`currency: "eur"`). That's fine while plans are sold in EUR only.
- No scheduled reconciliation compares every Stripe balance transaction with the ledger. Refunds are reconciled per charge after each operation, and dashboard refunds through `charge.refunded`. A full balance-transaction reconciliation report is proposed in `docs/operations/financial-reconciliation.md`.
- The ledger is append-only by convention. Nothing in the database forbids UPDATE or DELETE on `ledger_entries`; a database-user grant or trigger would enforce it.
