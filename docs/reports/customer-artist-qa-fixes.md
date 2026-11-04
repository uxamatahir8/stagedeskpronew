# Customer and artist fixes, and role-based QA

The three client reports are fixed and verified locally. A role-by-role audit found and fixed
further defects, including two in this work's own first version. **Nothing has been pushed, merged, deployed or run against staging**, and
some real-world paths could not be tested here (see BLOCKED).

| | |
| - | - |
| Initial staging commit | `08e9e037379e033f3d665b461a616fde883e2417` |
| Working branch | `fix/customer-artist-portal-qa` |
| Final commit | `164ba5d` tested; the commits on top add only these documents |
| Environment | Windows, local MySQL, Redis, Mailpit, stripe-mock, demo data |

Details per finding:
[customer portal](../audits/customer-portal-review.md),
[artist assignments](../audits/artist-assignment-review.md),
[full role-based QA](../audits/full-role-based-qa.md).

## The three client reports

**"I cannot edit or see the event and fill in the do's and don'ts, Spotify."** These fields
existed only in the agency's editor. Customers now see the whole booking and have an Edit
Event Preferences button for genres, do's, don'ts, playlist and instructions. Date, venue,
times and guests change directly until a quote is out; after that they become a request the
agency approves or refuses, and the booking doesn't change until then.

**"There is nothing in customer login that he can create/request booking."** There is now a
request form at `/app/event/request`, offered from the dashboard and the event page. What's
already known is filled in, the request goes only to an agency the person is a customer of,
and repeated submits make one booking.

**"The agency artist login is not seeing the assigned request."** There was no single cause.
The ones most likely to explain the report:

1. Profiles with no login could be assigned, and the agency was told "Request sent". The
   demo data has this exact case. These are now refused, explained, and can be invited.
2. An artist with another agency active got a 403 from the link in their own notification.
3. Undated gigs were filed as past, and two pages used different rules, with a cap of 20.

The defects were found by reading code and data and then pinned with tests. They were not
reproduced in a browser on the old code before being fixed. The browser defects that *were*
seen first-hand are the two phone overflows (QA-03, QA-04).

## DONE

Implemented and verified by a test named in the audit documents.

- Customer: preferences editor, full event page, booking requests with duplicate protection,
  change requests, agency setting, playlist allowlist on all three forms.
- Artist: one classifier and query, no cap on open requests, undated handling, pending count,
  account states, refused assignment, invite and resend, gigs independent of the active agency,
  ended-request page, unlink on removal from a team.
- Agency: approve or refuse changes, account warnings, artist and customer told about edits.
- Audit fixes: guards on writes (QA-02), phone overflows, flaky test timeout.
- New browser coverage: every menu page for 8 roles on desktop and phone; independent artist
  onboarding; custom role permissions.

## PARTIALLY DONE

Implemented, but the specific path has no direct test.

| Item | What's missing |
| ---- | -------------- |
| Suspended agency's actions refused (QA-01) | No test calls an action directly on a suspended agency |
| "Saved, but the artist may not have been told" (AR-08) | Failure message path is not tested |
| Email to a lent artist (AR-11) | Runs in existing paths, not asserted |
| Platform admin assign errors (AR-12) | The action itself isn't tested |
| Bookings at other agencies list (CP-05) | Not exercised in a browser |
| "Your other bookings" list (CP-08) | Page opened, list not asserted |
| Customer who is also an artist in Messages (QA-05) | Combined list not asserted |
| Switch offered for a booking at another of the person's agencies (QA-09) | Page state not exercised |
| Edit dialog keeps typed values when refused (CP-12) | Not asserted |
| Pages other than the workflows above | Opened and checked for errors; their buttons weren't pressed |

## NOT DONE

| Item | Reason |
| ---- | ------ |
| Email to the customer on a change decision | In-app notification only; would need a new template. Your call |
| Customer cancels their own booking | Not requested in this work; they can message the agency |
| Resetting the form on failed validation in `OnboardingForm` | Noticed, left alone; low impact |
| Two tabs or people editing one booking's wishes at once | The last save wins; there's no version check. Agency and customer can overwrite each other |
| Comparing figures across all pages, for example dashboard against Earnings | Not audited. Financial tests pass but weren't extended |
| Dependency advisories | 1 low (`deepmerge` 4.3.1), 1 moderate (`minimatch` 10.2.6), both transitive; no safe automatic fix applied |
| Next.js 16.4.2 to 16.4.5 | Not attempted in this branch |
| Smoke scripts | Out of date on staging too; not repaired. Website script not compared against staging |

## BLOCKED

| Item | Needs |
| ---- | ----- |
| Staging browser QA | Authorization and named test tenants. Not attempted |
| Real Stripe payment, payout and refund | Test keys for a live Stripe test account. Only stripe-mock and a fake were used |
| Real email delivery | A real SMTP server. Delivery went to Mailpit |
| Real custom domain | DNS and TLS. Only `*.localhost` |

## PRODUCTION BLOCKERS

No code defect found in this work blocks release on its own, but this was not a full
production sign-off, because the BLOCKED paths above are unverified.

Before this reaches production:

1. Run the query in the [artist review](../audits/artist-assignment-review.md#before-deploying)
   on staging and production. Agencies with results have requests nobody can see, and need to
   invite those artists or reassign.
2. Agencies should expect artists without a login to be refused until invited. That's the
   intended change, but it's visible, so tell them first.
3. Complete a real Stripe test-mode payment, which was not done here.

## Changes

**Migration:** `20261106090000_customer_portal_change_requests`, additive only:

| Table | Change |
| ----- | ------ |
| `bookings` | `musicRequests`, `specialRequests`, `clientRequestId`, plus a unique index on (`organizationId`, `clientRequestId`) |
| `organizations` | `customerPreferencesEditable`, default true |
| `booking_change_requests` | New |

Applied to a local database and to a fresh test database. `prisma migrate diff` afterwards
was empty. Rollback: drop the new table, index and columns; no existing column changes meaning.

**Behaviour existing users will notice:**

- Assigning an artist with no working login is refused.
- Playlist links must be on a known music service, also for agencies. Links already stored
  stay and are still shown, but saving that booking's details again asks for a valid link or
  an empty field.
- Removing a team member unlinks their artist profile.
- Agency actions on details, notes and services are blocked when read-only.

**Changed files:** 75 files against staging before this report: 4,644 lines added, 302 removed, 12 of the files tests. `git diff --stat origin/staging..HEAD` lists them.

New:

- Core: `gigs.ts`, `customer-event.ts`, with tests.
- DB: `gigs.ts`, `artist-accounts.ts`, `customer-event.ts`, `customer-artist-portal.test.ts`.
- Web: `app/event/actions.ts`, `event-editors.tsx`, `event/request/*`, `artists/[id]/account-panel.tsx`,
  `agency-settings/customer-portal-form.tsx`, `components/booking/switch-agency-link.tsx`,
  `lib/change-requests.ts`.
- E2E: `customer-artist-portal`, `role-crawl`, `independent-artist`, `role-permissions`.

Existing test fixtures gained a membership or user for their artists, because assignment now
requires one. No assertion was removed or weakened.

## Test results

| Check | Command | Result |
| ----- | ------- | ------ |
| Core rules | `turbo run test --force --concurrency=1` | 236 of 236 |
| Database integration | same | 220 of 220, including 36 new in `customer-artist-portal.test.ts` |
| Payments, financial regression | same | 57 of 57 |
| Web, including real auth endpoints and email outbox | same | 41 of 41 |
| Email templates | same | 13 of 13 |
| Typecheck | `turbo run typecheck --force` | Pass |
| Lint | `turbo run lint --force` | 0 errors, 1 warning that was there before (`role-has-required-aria-props`) |
| Production build | `pnpm build` | Pass |
| Migrations | `prisma migrate status`; applied fresh on the test database each run | 41 applied, up to date |
| Browser suite | `pnpm --filter @stagedesk/web e2e` | **59 of 59 in one uninterrupted run**, 1.0 h, commit `164ba5d` |
| Smoke scripts | `bash scripts/smoke-*.sh` | **Fail on this branch and on staging alike; not a usable gate.** See below |
| Secret scan | gitleaks 8.28, all 171 commits | No leaks. `.env` is untracked |
| Dependency audit | `pnpm audit --prod` | 1 low, 1 moderate; 0 high, 0 critical. Not fixed |

Unit checks ran on `4054059`. The browser run's commit `164ba5d` differs from it only by one
test file, and the commits after that add only documents.

**Smoke scripts.** On this branch: accounts 25 passed, 11 failed; bookings 12, 12; payments 0, 18; affiliates 4, 13; dashboards 7, 19; website 38, 19. Five of the six were run on untouched staging `08e9e03` and compared by check name: all 121 checks gave the same result, so those failures aren't caused by this work. The staging comparison of the website script was stopped before it finished, so its 19 failures are **not** compared; they look stale (they expect `/en` addresses, which now redirect, and Dutch text on English pages), but that's a reading, not a measurement. The scripts date from October and `grep` raw HTML. Causes seen: a local admin password that no longer matches, exact text, and expecting a 403 status. Because some are permission checks, those were checked in a real browser: 14 restricted pages across customer, artist, staff and owner all show "no access". They return HTTP 200, because the refusal renders inside the streamed page. The scripts need updating or retiring.

**The clean run was not the first.** Earlier full runs each failed, and a reviewer should know why:

| Run result | Cause | Action |
| ---------- | ------ | ------ |
| 56 of 57 | Test opened a demo artist who already had a login | Test fixed |
| 58 of 59 | Test reloaded before the availability save finished | Test fixed |
| Stopped | My review found the two change-request bugs (CP-10, CP-11) | Code fixed, tests added |
| Stopped at 29 | Adding an artist stayed on the list (QA-10) | Code fixed. Seen once; cause inferred from the code, not isolated |
| 58 of 59 | First compile of a route took 20.7 s, past a 15 s wait | Route added to the warm-up list |
| Stopped | Dev server out of memory after 2 h 7 min across two suites; its cache then caused a reload loop | Fresh server and cache per run |
| 53, then stopped | Date change landed on a day DJ Sem already plays. The app correctly refused it | Test dates fixed; the refusal is now a tested step |
| 55 of 59 | Upcoming gigs sat behind old ones on page 2 (AR-16); leftover test equipment pushed an item off page 1 | Code fixed; `pnpm db:clean-test` |
| 58 of 59 | Test silently skipped a reset, because `isVisible()` ignores its timeout | Test fixed |

No assertion was weakened to get to green. Warm-up and date changes alter when and with what
the tests run, not what they check.

## Browser QA coverage

Chromium through Playwright against the local app; every role signed in with a demo or
test-domain account. Coverage per role, and what was only opened rather than exercised, is in the
[QA document](../audits/full-role-based-qa.md#browser-coverage). **Not every button on every page was
pressed**: the crawl proves pages render for each role, and specs prove the listed workflows.

Screenshots: `docs/reports/screenshots/customer-artist-qa/`.

## Recommended staging acceptance tests

Use a named test tenant.

1. Sign in as a customer with no bookings. Request Booking is visible; submit one and note the
   reference. The agency has a notification and the booking shows "via customer portal".
2. As that customer, edit do's, don'ts and add a Spotify playlist, then reload. Try a
   non-music link and confirm it's refused.
3. Agency: send and accept a quote. Pick an artist: one without a login is disabled and says why.
4. Assign an artist with a login. Their email arrives, the badge shows 1, the request is on the
   dashboard and Gigs, and the brief shows the customer's wishes.
5. Artist accepts on a phone. Agency sees Confirmed.
6. Customer requests a date change. The booking doesn't move. Agency approves. Date moves, and
   the artist is notified.
7. Assign an undated booking. It stays visible with "Date not scheduled yet".
8. Sign in as an artist who is also a customer of another agency, with that agency active. The
   notification link opens the gig.
9. Invite an artist with no login. They get the setup email, and any waiting request appears.
10. Real Stripe test-mode payment on the customer's event page.
11. Agency turns off customer editing. The customer sees it locked.
12. Run the migration on a copy of production data first, and the query above.
