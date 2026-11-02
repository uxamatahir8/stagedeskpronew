# Full codebase consistency review — coverage and findings

## Coverage register (honest)

The branch has 873 tracked files (520 in `apps/web`, 127 `packages/db`, 54
`packages/core`, 23 `packages/payments`, 9 `packages/emails`, 5 `apps/worker`, 39
migrations). This session did **not** read all of them. What was actually inspected:

**Read in full or in the relevant part (≈60 files):** `CLAUDE.md`, `README.md`;
`packages/db/prisma/schema.prisma` (organizations, artists, bookings, assignments,
quotes, payments, ledger, financial operations, invoices, counters, inventory models);
`packages/db/src/bookings.ts`, `inventory.ts` (items, categories, suggestCode,
availability, pickable items), `booking-equipment.ts` (summary), `reminders.ts`,
`notifications.ts`, `tenant.ts` (model list), `audit.ts` (auditTx), `agencies.ts`
(header), `index.ts`, `test/global-setup.ts`; `packages/core/src/fees.ts`, `quotes.ts`,
`money.ts`, `bookings.ts` (invoice numbers, transitions table excerpt), `inventory.ts`
(schemas, availability), `pages.ts` (reserved slugs), `settings/fees.ts`;
`packages/payments/src/payouts.ts`, `booking-payments.ts`, `test/fixtures.ts`,
`money-flow.test.ts`; `packages/emails/src/index.ts`, `copy.ts` (quote, gig reminder),
`templates.tsx` (QuoteSent, GigReminder), `layout.tsx`, `samples.ts`, `templates.test.tsx`;
`apps/worker/src/reminders.ts`; web: bookings actions, booking page, booking panels,
quote builder, quote table, new booking page and form, calendar, month grid, artist
actions/forms/detail page, artist home, gigs list and gig page, gig equipment page,
earnings page (share), platform-artists page/actions/manager, users actions and menu,
impersonation actions, support actions, agency settings page/actions/inventory form,
inventory list page, item form, item actions, equipment workspace (main render, add
section), equipment view, booking equipment page, PDF document and renderer, quote and
invoice PDF routes, `lib/mail.ts`, `lib/deliver.ts`, `lib/quote-email.ts`,
`lib/payment-claims.ts` (receipts), `lib/password-setup.ts`, `lib/actions.ts`,
`lib/auth-config.ts` (verification part), `lib/viewer.ts` (organization shape),
`lib/storage.ts` (image detection), public quote page and actions, notifications page
(icons); e2e `helpers.ts`, `booking-flow.spec.ts`, `inventory.spec.ts` (helpers and
artist steps), `playwright.config.ts`.

**Checked mechanically, not read:** all 57 `"use server"` files (auth scan, see the
security review); raw SQL in the web app; agency pages reading through `prisma`.

**Not inspected this session:** marketplace/leads, affiliates and withdrawals, agency
websites and custom domains, content/blog/help, newsletter, subscriptions and billing
incidents, refunds (`refunds.ts`), webhooks, Stripe Connect onboarding, messages,
support tickets, reviews, the proxy, CI workflows, Docker, deployment and operations
docs. Their earlier audits in `docs/audits/*` were not re-verified.

## Inconsistencies found and fixed

| # | Inconsistency | Where | Fix |
|---|---|---|---|
| 1 | Agency-entered customers got English mail from a Dutch agency | `resolveBookingCustomerTx`, `emailQuote` | Agency correspondence language; quote language stored and reused |
| 2 | Reminders and receipts ignored the quote's language and the agency sender | worker `reminders.ts`, `lib/payment-claims.ts` | `customerLocale(b)` / `bookingMailLocale()` + agency sender |
| 3 | A booking shows an artist, the artist's home doesn't | `artist-home.tsx` (`eventDate >= today` drops null dates) | Null dates included; same in artist detail page |
| 4 | Withdrawn or cancelled artists weren't told | `assignArtist`, `changeBookingStatus` | `gig_withdrawn` / `gig_cancelled` notifications + emails |
| 5 | Fixed deposit would read "Deposit (0%)" | `quote-table.tsx` | Label by deposit type, balance shown |
| 6 | Equipment shown on the booking only as a sidebar box | booking page | Main-column section |
| 7 | Defective state only reachable from the item page; Condition looked like it | inventory list, item form | Row actions, hint |
| 8 | Issued invoices lose their logo when the logo changes | `agency-settings/actions.ts` | Files kept once invoices exist |
| 9 | Editing an artist could silently unlink their account | `artists/actions.ts` | Current link kept |
| 10 | Earnings, dashboard SQL and payouts would treat any non-percentage pay as a share | `earnings/page.tsx`, `dashboards.ts`, `artist-home.tsx`, `payouts.ts` | One rule: `artistEarnings()` / `artistCutOfPayment()` |
| 11 | Invoice PDF language came only from the viewer's `?lang` | `api/pdf/invoice` | Snapshot language unless `?lang` given |

## Known inconsistencies left open

- `CLAUDE.md` says Dutch is the default locale without prefix; the code has English
  without prefix and Dutch under `/nl` (`lib/mail.ts` `absoluteUrl`, migration
  `20261025162358_english_default`). Documentation should be corrected by the team.
- The Playwright suite's own comment in `booking-flow.spec.ts` (customers default to
  English) no longer holds after this branch; the step is language-independent.
- `components/ui/select.tsx` lint warning (combobox ARIA props), pre-existing.
