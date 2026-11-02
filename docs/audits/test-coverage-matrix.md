# Test coverage matrix — client feedback branch

Environment: local Windows dev machine, Docker MySQL 8 (port 3307, tests on a
freshly migrated `stagedesk_test`), Redis, Mailpit, stripe-mock. No GitHub CI run
and no staging run were made from this branch.

| ID | Unit (core) | DB integration | Payments (fake Stripe / stripe-mock) | Email render | Browser (e2e `client-feedback.spec.ts`) |
|---|---|---|---|---|---|
| CF-01 defect | — | `inventory-batch.test.ts` (defective one of a batch) + existing `inventory*.test.ts` | — | — | Report defect from the list, repair ✔ |
| CF-02 batch | — | `inventory-batch.test.ts`: 1/2/4/40 units, max 100, taken/repeated codes and serials, other maker/agency allowed, bulk/sets refused, concurrent overlapping batches | — | — | 4 lights, duplicate serial refused, 4 created ✔ |
| CF-03 equipment on booking | — | existing inventory suites | — | — | Section link → packing list ✔ |
| CF-04 DJ checklist | — | existing `equipment-access.test.ts` | — | — | covered by existing `inventory.spec.ts` (artist loading) — see full-suite result |
| CF-05 calendar | — | — | — | — | Day link → form with date, back link ✔ |
| CF-06 fixed fee | `compensation.test.ts` (10): never a percentage, spread over payments, rounding, cap + shortfall, old percentage behaviour identical | `booking-options.test.ts`: snapshot, override, refusal, currency mismatch | `money-flow.test.ts`: €250 over deposit + balance, idempotent rerun, totals add up; shortfall + unconnected artist owed | — | Fixed €250 for the booking, artist sees "Jouw vergoeding: € 250,00" ✔ |
| CF-07 details link | — | `detail-requests.test.ts` (5): hash only, once, revoke/replace/expiry, kept agency edits, refused after acceptance, cross-agency | — | sample renders NL/EN | Copy link, customer submits, link dead after, agency sees values ✔ |
| CF-08 language | `quotes.test.ts` | `booking-options.test.ts` (agency-entered customer → nl; quote stores locale) | — | — | Dialog shows Dutch, Dutch email ✔ |
| CF-09 quote content | — | — | — | `templates.test.tsx`: all lines/amounts NL+EN, no-deposit text | Email has lines, deposit, reference, validity ✔ |
| CF-10 sender | — | — | — | `fromHeader` keeps address, blocks injection | From "Feestband Utrecht via StageDesk", Reply-To agency ✔ (own domain: not built) |
| CF-11 deposits | `quotes.test.ts` (5) | `booking-options.test.ts` (none, fixed capped, old depositBps, invalid) | existing checkout tests (`amountDue`) | — | Fixed €250 and "Geen aanbetaling" quotes ✔ |
| CF-12 numbering | `bookings.test.ts` (3) | `booking-options.test.ts`: prefix/continuous, preview, typed only when allowed, reuse refused, audit, counter skips, concurrent same number, legacy format | — | — | Typed number issued, duplicate refused ✔ |
| CF-13 template | `invoice-template.test.ts` (3) | — | — | — | Not run (no PDF assertion) |
| CF-14 support | — | `artist-admin.test.ts` (4) | — | — | Manage page, history protection ✔ |
| CF-15 log in as artist | — | existing `impersonation.spec.ts` | — | — | Button on list and page ✔ (not clicked) |
| CF-16 artist email | — | `booking-options.test.ts` (request / withdrawn / cancelled notifications) | — | sample renders NL/EN | Email in Mailpit with gig link, artist accepts ✔ |
| CF-17 resend | — | — | — | — | Resend for a no-password customer → setup link ✔ |

## Results of runs in this session

| Command | Result |
|---|---|
| `pnpm typecheck` | 7/7 packages pass |
| `pnpm lint` | 0 errors; 1 pre-existing warning (`components/ui/select.tsx`) |
| `pnpm test` | **485 passed, 0 failed, 0 skipped**: core 216 (25 files), emails 13, db 181 (24 files), payments 57 (7 files, stripe-mock contract included), web 18 |
| `npx playwright test e2e/client-feedback.spec.ts` | **1 passed** (2.8 min) |
| full Playwright suite | see `docs/reports/production-readiness-final.md` |
| `pnpm audit --prod` | 2 pre-existing advisories (low, moderate) in the `shadcn` CLI's `deepmerge` (dev tool) |
| Secret scan | gitleaks not installed locally; regex scan of the branch diff found nothing |

Baseline before changes (staging `1c60468`): typecheck 7/7; core 193, emails 8, db
149/150 — the one failure was this session's schema edit landing mid-run (the
tenant-model check), passing once the model was registered.
