# Customer and artist portal: final hardening

Follows an independent review of `fix/customer-artist-portal-qa`. All six required fixes are in and
tested locally. One decision is partly open (monthly limits at confirmation, below). **Not merged, not
deployed, no pull request opened, and nothing was run on a staging or production server.**

| | |
| - | - |
| Branch | `fix/customer-artist-portal-qa` |
| Start | `2215c45739af5ac2187363bebbe338c54e349c1e` |
| Staging base | `08e9e037379e033f3d665b461a616fde883e2417` (unchanged) |
| Environment | Windows, local MySQL, Redis, Mailpit, stripe-mock, demo data |

## Findings

| ID | Severity | Issue | Root Cause | Fix | Files | Tests | Status |
| -- | -------- | ----- | ---------- | --- | ----- | ----- | ------ |
| H-01 | P1 | An artist turned into staff, or disabled, kept reaching gigs | Each page filtered on `artist.userId` in its own way | One policy: linked profile, live account, current artist membership at the profile's agency; open gigs also need an active profile | `packages/db/src/artist-access.ts` and its callers | `portal-hardening.test.ts`, `portal-hardening.spec.ts` | Fixed |
| H-02 | P1 | Approving an old change request overwrote newer values | Approval compared nothing with the request's starting point | Under the booking lock, compare field by field; refuse, audit and show original, requested and current | `core/customer-event.ts`, `db/customer-event.ts`, `booking-panels.tsx` | Same files | Fixed |
| H-03 | P1 | Setup email reported as sent when it might not be | Fire-and-forget, one function doing account and email | Separate steps; awaited result; accepted never shown as delivered; resend replaces the old link | `lib/artist-account.ts`, `artists/actions.ts`, `account-panel.tsx` | `portal-mail.test.ts`, `portal-rules.test.ts`, spec | Fixed |
| H-04 | P2 | Real requests merged as duplicates | 10-minute check on matching details | Only the form's UUID marks a duplicate | `db/inquiries.ts`, `event/actions.ts` | `portal-hardening.test.ts`, spec | Fixed |
| H-05 | P2 | Requests ignored the plan's booking page entitlement | Only the agency's setting was checked | Entitlement checked on portal and public form; inquiries don't count against the monthly limit | `db/inquiries.ts`, `b/[slug]/actions.ts` | `portal-hardening.test.ts`, `portal-rules.test.ts`, spec | Fixed; see open question |
| H-06 | P2 | Customers weren't emailed about decisions | Notification only | Durable email per decision, keyed by request and outcome | `lib/change-requests.ts`, `packages/emails` | `portal-mail.test.ts`, spec | Fixed |
| H-07 | High | **New.** A date typed and followed straight away by a click on Save was lost: the field showed the new date, the form sent the old one | flatpickr applies text silently on mouse down; its blur handler then sees no change | Report the date on blur, which comes before the click | `components/date-picker.tsx` | `portal-hardening.spec.ts` | Fixed. Affects every form with a date field |
| H-08 | High | **New.** Smoke checks couldn't be trusted, including permission checks | Every page carries the whole translation file, so grepping raw HTML matches anything, on any page | Read rendered HTML; identify refusals by Next.js's digest | `scripts/smoke-*.sh` | Negative control below | Fixed |
| H-09 | Low | **New.** The artist page showed nothing when the account was fine | The panel hides when there's nothing to fix | State badge always shown | `artists/[id]/page.tsx` | Spec | Fixed |
| H-10 | Low | **New.** BullMQ counts workers across the whole Redis server, not per database | Library behaviour | Not changed. Tests bring their own worker. Don't share a Redis server between environments | `CLAUDE.md` | n/a | Documented |
| H-11 | Medium | The stuck-request query missed most causes | It only looked for profiles with no login | New read-only diagnostic and guide | `docs/operations/artist-assignment-*` | Isolated database, below | Fixed |

## What each change does to an artist's access

| Change | Open gigs, messages, equipment | Earnings history | Assignment record |
| ------ | ------------------------------ | ---------------- | ----------------- |
| Role changed to staff | Gone at that agency; work at other agencies untouched. Comes back if the role does | Kept | Kept |
| Removed from the team | Gone; profile unlinked | No longer linked | Kept |
| Account disabled | Gone | Gone with the account | Kept |
| Profile deactivated | Gone | Kept | Kept |
| Assignment withdrawn | Gone for that gig | Not applicable | Kept |
| Shared with another agency | Works from any active agency | Kept | Kept |

Someone who became staff can read their agency's conversations as staff. That's the staff permission, not artist access.

## Change requests

A request is refused as stale only when a field it asks to change moved after the customer asked; other
fields changing don't block it. The reviewer sees original, requested and current values, and can refuse,
or apply it anyway after a confirmation. Applying anyway is tied to the exact values they saw: if the
booking moves again, it's refused again. The override is audited. A refused approval tells the customer nothing.

Applying a change never touches the money or the accepted quote's snapshot.

## Product decisions

| Decision | Implementation |
| -------- | -------------- |
| Guidance on artist accounts | A message per state, with Invite, Link existing account, Resend setup email; a notice on the artist list and booking page with a link to the profile |
| Requests off when the booking page is off | Same for a plan without it. No separate setting |
| Emails on approval and refusal | Done, in the customer's language, then the agency's |
| Inquiries don't count against the monthly limit | Done and pinned by a test |
| Accurate pushed status | Corrected in the earlier report |
| Corrected smoke reporting | Corrected in the earlier report |

**Open question for the product owner: should reaching the monthly booking limit stop a booking from being
confirmed?** The brief asks to apply applicable limits at confirmation using the existing billing policy.
That policy has no such rule: `maxBookingsPerMonth` counts bookings an agency enters itself, and nothing
checks a limit when a quote is accepted. Adding one means a customer's acceptance could be refused for the
agency's billing reason, which would be new behaviour, so the existing behaviour is kept and pinned by a test
(`doesn't count or block inquiries at the monthly limit, and the booking can still be confirmed`).

### Differences between request channels

| Situation | Customer portal | Public booking page |
| --------- | --------------- | ------------------- |
| Booking page off | Closed | Closed |
| Plan without booking page | Closed | Closed |
| Suspended agency | Closed | Closed |
| Read-only (lapsed subscription) | Closed | **Open** |
| Monthly limit reached | Open | Open |

The read-only difference was already there and is kept: a stranger's inquiry shouldn't be lost because of
the agency's billing, while a signed-in customer is told to contact the agency. Say if it should change.

## Database changes

**None. This round added no migration and no schema change.** Validated anyway:

| Check | Result |
| ----- | ------ |
| All migrations on an empty, isolated database | 41 applied |
| `prisma migrate status` | Up to date |
| `prisma migrate diff` against `schema.prisma` | No difference |
| Diagnostic on that database, one record per state | All 6 states correct; accepted and cancelled cases excluded |
| Writes during the diagnostic | Row counts unchanged; a write in its transaction is refused (error 1792) |
| Personal data in its output | No email addresses |

The isolated database was dropped afterwards. The real data shape on staging is untested.

## Security

- Artist access has one source; direct URLs and actions from a page left open are refused (tests below).
- A refused page sends none of the booking in its response, checked on the whole response.
- Setup links: one valid at a time, single use, expire, resend limited to 5 an hour per artist and invitations to 30 an hour per agency, audited.
- Customer emails carry only what the customer may see; the reviewer's note is included because the form labels it as a message for the customer.
- Secret scan: gitleaks 8.28, 180 commits, no leaks.
- Dependency audit: `pnpm audit --prod` found 1 low (`deepmerge`) and 1 moderate (`minimatch`), both through `shadcn`; no high or critical. CI's gate is `--audit-level high`.

## Test results

Local only. **CI has not run on this work**: CI runs on pull requests and on `staging`, and there's no pull request.

| Check | Command | Result | Commit |
| ----- | ------- | ------ | ------ |
| Install | `pnpm install --frozen-lockfile` | Pass | `b41a2ad` |
| Generate | `pnpm db:generate` | Pass | `b41a2ad` |
| Lint | `turbo run lint --force` | 0 errors, 1 warning that was there before | `b41a2ad` |
| Typecheck | `turbo run typecheck --force` | 7 of 7 packages | `b41a2ad` |
| Unit and integration | `turbo run test --force --concurrency=1` | **617 of 617**, 0 skipped: core 242, db 250, payments 57, web 55, emails 13 | `b41a2ad` |
| Added afterwards | `vitest run src/lib/portal-rules.test.ts` | 9 of 9, run on its own, so **626 in total, not in one run** | `f29135c` plus that file |
| Build | `pnpm build` | Pass | `b41a2ad` |
| Browser | `playwright test`, 1 worker, fresh server, cleaned data | **64 of 64, 0 failed, 0 skipped, one uninterrupted run, 1.2 h** | `f29135c` |
| Role crawl | Part of that run | 372 visits, 94 paths, 186 on phone, 9 roles: 0 console errors, 5xx or overflow | `f29135c` |
| Smoke | `bash scripts/smoke-*.sh` | 198 of 198, see below | `f29135c` |

`f29135c` differs from `b41a2ad` only in documents. Baseline before this work: 567 unit and integration, 59 browser.

### Required scenarios

| # | Scenario | Where |
| - | -------- | ----- |
| 1, 3, 4, 5 | Customer books, edits wishes, asks for a change, agency approves | Browser: `customer-artist-portal`, `portal-hardening` |
| 2 | Two distinct same-day requests | Browser, database |
| 6, 8 | Notification and one email, on approval and refusal | Browser, Mailpit |
| 7 | Agency refuses another | Browser |
| 9, 10 | Booking changes after the request; stale approval blocked from an open page | Browser, database |
| 11, 12, 13 | Invitation, password setup, assignment | Browser, Mailpit |
| 14, 15 | Active agency changed; cross-agency access | Browser |
| 16 | Membership revoked: role change and removal | Browser, database |
| 17, 18 | Unauthorized gig detail; answering from a page left open | Browser, database |
| 19 | Equipment: artist reaches it, others don't, revoked doesn't | Browser, database |
| 20 | Subscription: booking page in the browser. **At limit, suspended, read-only and missing entitlement are database or web-layer tests only** | Mixed |

### Known test limits

- **Outages are simulated.** Redis and database failures are forced by making the call fail. SMTP failure uses a failing sender. No service was really stopped.
- Redis and SMTP recovery are tested on the shared outbox with the setup email. The decision email uses the same path, but its own Redis and SMTP cases aren't separately tested; storage failure is.
- "Direct server action" means the real action fired from a page left open, plus the service functions called directly. No hand-built action request was sent.
- "Booking updated during approval" is shown by the sequence and by the row lock. Simultaneous approvals, approve with refuse, withdraw and cancel are tested truly at once.
- Earnings access is tested through `currentArtistIds`, not by reading the page's figures.
- Mailpit shows the mail was handed over and what it says. Real delivery and inbox rendering are untested.

## Smoke scripts

The scripts' failures were all in the scripts. **No product defect was found through them.** Worse, some earlier passes meant nothing.

| Earlier failure | Cause | Replacement |
| --------------- | ----- | ------------ |
| Payments 18 of 18, affiliates 13, dashboards 19, part of website | `/en/...` addresses now redirect, and curl didn't follow | Unprefixed addresses; a check pins the redirect |
| Admin checks | Depended on the demo admin's password (401) | Own admin on a test domain |
| Permission checks, either way | Expected a 403, or grepped text that's on every page | Next.js's digest `NEXT_HTTP_ERROR_FALLBACK;403`, checked on authorized and refused pages of each role |
| Text checks | Dutch text on English addresses | `/nl` where Dutch is meant |
| Customers, quotes, artists | Depended on being on the first page | Search by name, so "can't see" can't pass through paging either |
| Affiliate materials | Moved to the Partners tab | Correct tab |
| Invitation flow | Subject line in one language, and left invitations holding seats | Finds the link; removes what it made |

**Retired, not replaced:**

| Check | Why |
| ----- | --- |
| "payments without Stripe explains" | Depends on whether this machine has Stripe keys. Covered by payment logic tests |
| "worker sent it" | Read a log file that doesn't exist under `pnpm dev:e2e` |

**Added:** cross-agency and cross-customer checks on gigs, bookings, artists and PDFs; a wrong password; refusals on agency payments. Scripts now exit non-zero on failure, and a rate-limited email check prints `NOT RUN` rather than passing.

| Script | Before | Now |
| ------ | ------ | --- |
| accounts | 25 passed, 11 failed | 42 passed, 0 failed |
| bookings | 12, 12 | 34, 0 |
| payments | 0, 18 | 19, 0 |
| affiliates | 4, 13 | 17, 0 |
| dashboards | 7, 19 | 26, 0 |
| website | 38, 19 | 60, 0 |

**Checks can fail:** run deliberately against an allowed page and a refused one, `refused` and `has` both failed and the script exited 1.

**No staging comparison was performed in this round.** The earlier comparison is described accurately in the [earlier report](customer-artist-qa-fixes.md). Limitations: local demo data only; a dev server, not a production build; `pnpm db:clean-test --yes` removes the smoke admin, and three old click rows with the campaign `smoke` remain from the previous script's run.

## Remaining items

| Item | State |
| ---- | ----- |
| Monthly limit at confirmation | Open question above |
| Read-only agencies still receive public inquiries | Kept and documented |
| If the outbox and queue are both down, the setup or decision email is sent best-effort and reported as failed. Trying again can send a second copy | Accepted: not telling the user would be worse |
| Agency and customer saving wishes at once: the last save wins | Not changed |
| Push-then-refresh in the agency switcher, sign-out, invitation and quote account setup | Never seen failing; not changed |
| `OnboardingForm` resets what was typed when validation fails | Low impact; not changed |
| Next.js 16.4.2 to 16.4.5, `deepmerge`, `minimatch` | Not changed |

## Before staging

Needs authorization for that environment.

1. Back up the database. No migration comes with this round; run `prisma migrate status` to confirm.
2. Run the [diagnostic](../operations/artist-assignment-diagnostic.sql) and keep the output. Follow the [remediation guide](../operations/artist-assignment-remediation.md). Nothing is changed automatically.
3. Check that staging has its own Redis server or instance (H-10), and that a worker is running.
4. Tell agencies: artists without a working login can't be assigned; a role change ends artist access.

**Customer:** two requests on one day stay separate; edit wishes; ask for a change; see approval and refusal in the app and in a real inbox, in Dutch and English.

**Artist:** invitation arrives in a real inbox; set a password; a used and an expired link are refused; answer a request; switch agency; change role and confirm access ends while other agencies' work stays.

**Agency:** a request whose fields changed shows the conflict; apply anyway is audited; artist list guidance with each action; type a date and click Save straight away.

**Email:** real SMTP, sender domain, spam placement, outbox status in the admin view, a resend.

**Subscription:** booking page off; a plan without it; a lapsed and a suspended agency; decide the open question.

**Still only possible with outside access:** real Stripe test-mode payment, real SMTP delivery, real DNS and TLS.
