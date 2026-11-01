# UI/UX, accessibility and localisation

## Changed in this pass

- Refund dialog: one request id per opened dialog, so a double click or a retry continues the same refund. New messages for "refund is being confirmed" (Stripe answered late), "another refund or payout is running" and "Stripe refused" (nl + en).
- Platform → Payments & payouts: a card listing refunds and payouts that need attention (amount in the operation's currency, agency, booking code, error, attempts). Buttons to retry or to book with a shortfall; the shortfall action asks for confirmation in a dialog. Event filter now includes "processing" and "gave up".
- Withdrawal status "Transfer in progress" (`processing`), with a warning tone.
- Newsletter campaign: "Retry failed" next to the failure count.
- Team: an invitation whose seat check fails now says so, instead of reporting success.
- Marketplace request page: a second click on the accepted price shows the same success message (it used to show "closed").
- CSV exports: a `currency` column per row instead of `_eur` headers.

Every new string exists in `nl.json` and `en.json`, and the web typecheck (keys checked against en) passes. Lint passes, with one pre-existing jsx-a11y warning (a `combobox` without `aria-controls`/`aria-expanded`).

## Not reviewed (UNVERIFIED)

A page-by-page review of the 115 pages for terminology, loading/empty states, keyboard and screen-reader use, contrast, and WCAG 2.2 AA was **not done**. Nor was a full translation audit (untranslated server errors, date/time zones). Known from this pass: the platform payments stat cards show all currencies as euros (F-32), and a pre-existing lint warning flags a combobox missing `aria-controls`/`aria-expanded`.
