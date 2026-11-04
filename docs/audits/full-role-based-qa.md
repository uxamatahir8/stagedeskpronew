# Full role-based QA

Everything here was run locally: dev server, local MySQL, Redis, Mailpit and stripe-mock,
with demo data and test-domain accounts. **Nothing ran against staging or production, and no
real customer records were touched.** Real Stripe payments, real SMTP delivery and real DNS
were not exercised.

## How to read the evidence

| Label | Meaning |
| ----- | ------- |
| Verified code defect | Found by reading the code; the fix has a test or is shown by one |
| Reproduced browser defect | Seen in a real browser run before it was fixed |
| Missing feature | The workflow didn't exist |
| UX improvement | Worked, but was hard to find or use |
| Unverified observation | Noticed, not confirmed as a defect |

Two depths of browser evidence are kept apart below:

- **Opened**: the role crawl loaded the page and found no server error, no console error, no
  failed request, no untranslated key and no overflow on a phone. It proves the page renders
  for that role, not that its buttons work.
- **Exercised**: a Playwright spec performed the workflow and checked the result.

## Browser coverage

`apps/web/e2e/role-crawl.spec.ts` reads each role's real sidebar, opens every link, and
follows one example of each kind of detail page, on 1280×800 and 390×844.

@@CRAWL_TABLE@@

Screenshots of every crawled page are produced by setting `QA_CRAWL_OUT`; a selection is in
`docs/reports/screenshots/customer-artist-qa/`.

**Not visited by the crawl**, because they're reached by token or from inside a flow; the
ones marked "exercised" are covered by specs instead:

- Quote link `/q/<token>`: exercised (`booking-flow`).
- Customer details link `/d/<token>`: exercised (`client-feedback`).
- Invitation `/invite/<id>`: exercised (`invitations`).
- Reset and first-password pages: exercised (`auth`, `customer-artist-portal`).
- Gig equipment `/app/gigs/<code>/equipment`: exercised (`inventory`, `customer-artist-portal`).
- Booking equipment and print pages: the page is exercised (`inventory`); the print view is not.
- Public lead pages `/request/<reference>`: exercised (`leads`).
- Agency website on its own domain: exercised (`sites`), against `*.localhost` only.
- Marketing pages other than those listed: `website` and `content` cover some. The rest were
  not visited.

## Coverage by role

### A. Platform administrator

| Area | Evidence |
| ---- | -------- |
| Dashboard, Agencies, Users, Artists, Bookings, Leads, Payments, Plans, Pages, Content, Texts, Newsletter, Emails, Settings, Payment setup, Audit, Support | Opened |
| Agency creation, suspension, deletion; partners; admins | Exercised (`admin`) |
| Artist support: withdraw, confirmation resend | Exercised (`client-feedback`) |
| Impersonation | Exercised (`impersonation`) |
| Leads | Exercised (`leads`) |
| Subscriptions rules, fee deals | Exercised (`platform-settings`) |
| Content, texts, comments, legal pages | Exercised (`content`, `texts`, `website`) |
| Platform payments, newsletter sending | Opened only |
| Affiliate management | Exercised for approval (`affiliate`); payout management opened only |

### B. Agency owner

| Area | Evidence |
| ---- | -------- |
| Bookings, Quotes, Invoices, offline Payments, refunds | Exercised (`booking-flow`, `client-feedback`) |
| Calendar, Customers, Services, Reviews, Referrals, Booking page | Opened |
| Artists, assignment, invitations | Exercised (`customer-artist-portal`) |
| Artist requests between agencies | Opened; logic in DB tests |
| Inventory, packages, reservations, loading, returns | Exercised (`inventory`, `inventory-security`) |
| Website and custom domain | Exercised (`sites`), local only |
| Team, roles and permissions | Exercised (`invitations`, `role-permissions`) |
| Notifications, Messaging | Exercised (`communication`, `customer-artist-portal`) |
| Agency settings | Exercised in part (`booking-flow`, `inventory`) |
| Subscription purchase, financial reports | Opened only; Stripe not exercised |

### C. Agency administrator and staff

| Area | Evidence |
| ---- | -------- |
| All menu pages for both roles | Opened |
| Custom role: a right removed, staff refused, admin kept, reset | Exercised (`role-permissions`) |
| Restricted server actions: direct requests refused | Exercised for inventory (`inventory-security`). Other actions: guards read in code, see QA-02 |
| Staff seats | Exercised (`invitations`), plus 14 tests through the real auth endpoints |

### D. Agency artist

| Area | Evidence |
| ---- | -------- |
| Dashboard, pending and accepted gigs, details, accept, decline, equipment, notifications, messages | Exercised (`customer-artist-portal`, `inventory`) |
| Availability, Earnings, Profile | Opened |
| Mobile | Opened on a phone viewport |

### E. Independent artist

| Area | Evidence |
| ---- | -------- |
| Sign-up, onboarding, availability, a listing | Exercised (`independent-artist`) |
| Bookings, customers, payments, earnings pages | Opened |
| Public profile, ordering a listing | DB tests only, not in a browser |
| Taking payment | Not exercised |

### F. Customer

| Area | Evidence |
| ---- | -------- |
| Dashboard, Request Booking, event details, preferences, change requests | Exercised (`customer-artist-portal`) |
| Quotes, reported payments | Exercised through the quote link (`booking-flow`) |
| Messages | Exercised (`communication`) |
| My payments, invoices, profile | Opened; invoice PDF exercised from the agency side |
| Online payment | Not exercised (Stripe logic in tests with a fake and stripe-mock) |

### G. Affiliate

| Area | Evidence |
| ---- | -------- |
| Application, approval, referral credit | Exercised (`affiliate`, `auth`) |
| Links, Payouts, Profile, Notifications | Opened; withdrawal rules in DB and payments tests |

### H. Public visitor

| Area | Evidence |
| ---- | -------- |
| Sign-in, password reset, invitations | Exercised (`auth`, `invitations`) |
| Booking page, inquiry, bot handling, embed | Exercised (`inquiry`, `embed`) |
| Quote acceptance, details links | Exercised (`booking-flow`, `client-feedback`) |
| Registration | Exercised (`invitations`, `independent-artist`) |
| Navigation, mobile | Listed pages opened on both screens |

## Findings

Customer and artist findings are in [customer-portal-review.md](customer-portal-review.md)
and [artist-assignment-review.md](artist-assignment-review.md).

| ID | Severity | Role | Page | Issue | Root Cause | Fix | Test Evidence | Status |
| -- | -------- | ---- | ---- | ----- | ---------- | --- | ------------- | ------ |
| QA-01 | High | All agency roles | Any action | A suspended agency's pages were hidden, but its server actions still worked when called directly. | Only the shell checked suspension; many actions skip `writeBlocked`. | `requireAgency` refuses a suspended agency (support excepted). | Code; `admin` spec covers the shell. No test calls an action directly on a suspended agency | Fixed, verified code defect, direct case untested |
| QA-02 | Medium | Agency | Bookings, services, claims | These wrote without a billing or suspension check: details, accept on behalf, notes, services, status, payments, invoices, claim rejection. | Each action adds its own check; these lacked one. | `writeBlocked` on the first four; `suspendedBlocked` on money that really moved, so a lapsed agency can keep its books right. | Regression suite | Fixed, verified code defect |
| QA-03 | Medium | All with a calendar | Calendar, Availability | On a phone the page was 187px wider than the screen. | `sr-only` labels are absolutely positioned and escaped the unpositioned scroll container. | The scroll container is positioned. | Crawl: reported in the first run, 0 after the fix | Fixed, reproduced browser defect |
| QA-04 | Low | Platform admin | Pages | On a phone the tab bar made the page 13px too wide. | `w-fit` nav with no limit. | `max-w-full overflow-x-auto`. | Crawl: reported, 0 after the fix | Fixed, reproduced browser defect |
| QA-05 | Medium | Customer who is also an artist | Messages | The conversation list showed only one side. | `conversationScope` chose by role alone. | Both sides for that person. | No test of the combined list | Fixed, not specifically verified |
| QA-06 | Low | Developers | Tests | `pnpm test` failed on `email-delivery.test.ts` before any change: `beforeAll` timed out at 10 s in a parallel run, skipping 9 tests. | Default hook timeout too short for its imports. | `hookTimeout: 60000`; no assertion changed. | Baseline failed, 41 of 41 web tests pass now | Fixed, verified |
| QA-07 | Info | Developers | Crawl | Hydration errors reported on pages with forms. | The crawl's own screenshots: Playwright styles inputs, and React reported it. Not an app defect; not seen on a fresh load. | `caret: "initial"` on crawl screenshots. | Crawl reports 0 after the change | Closed, not a defect |
| QA-09 | Low | Agency team in several agencies | Booking | A booking notification from another of their agencies ended in a 404. | The page only reads the active agency, correctly, with no way across. | Names the agency and offers the switch. Only the person's own team memberships are searched. | Typecheck; no test exercises this page state | Fixed, not specifically verified |
| QA-10 | Low | Agency | Artists | After adding an artist the browser sometimes stayed on the list instead of opening the new artist. The artist was saved. | `router.push` followed at once by `router.refresh`; the refresh can cancel the push. Inferred from the code and one failing run, not isolated. | Refresh only when not navigating, as the inventory dialogs already do. | Seen once in a full run; subsequent run: see report | Fixed, reproduced browser defect |
| QA-08 | Low | Admin | Emails | "Blocked script execution in about:srcdoc" in the console. | The email preview iframe's empty sandbox refusing tooling's script. A sent email contains no script tags (checked in Mailpit). | None needed; ignored in the crawl with a comment. | Checked by hand | Closed, not a defect |

## Cross-module checks

| Scenario from the brief | Result |
| ------------------------ | ------ |
| Booking exists but customer can't see it | Fixed for several agencies (CP-05) |
| Artist assigned but request not visible | Fixed (AR-01 to AR-06) |
| Notification link leads to 404 | Fixed for gigs (AR-07). For a booking at another of the person's agencies, the page now offers the switch (QA-09) |
| Booking changed, artist brief outdated | The brief reads live; the artist is now told (CP-07) |
| Customer date change leaves equipment on the old date | Reservations follow the booking; approval is refused if equipment can't follow (existing check, reused) |
| Quote reflects outdated details | Existing `quote_outdated` guard; wishes don't trigger it; approved changes do |
| Invoice totals differ from payment totals | Not re-audited; earlier financial review and tests stand, and all pass |
| Agency sees a status different from the customer | Both read `booking.status`; no difference found |
| Button visible without permission | Not systematically checked beyond role pages |
| Permitted action inaccessible | Customer actions were the case found (CP-01, CP-03) |
| Form reports success without saving | Not found in the tested flows; persistence checked after reload for preferences and availability |
| Emails queued but never delivered | Outbox covered by `email-delivery.test.ts`; agency sees status per email on the booking |
| Role changes leave stale access | Fixed for removal (AR-10). Changing an artist's role: requests are refused and flagged, the link stays |
| Deactivated accounts assignable | Fixed (AR-09) |
| Subscription limits differ per module | QA-02. Public and portal requests aren't blocked by the monthly limit, deliberately (see customer review) |
| Duplicate submissions | Fixed for customer requests. Public form relies on its rate limits |
| Pages calculating the same figure differently | Artist earnings: the dashboard sums the upcoming list only; not compared against the Earnings page |

## Security checks

| Check | Result |
| ----- | ------ |
| Multi-tenant isolation | Existing tenant tests pass; new model added to `tenantModels` |
| Customer booking ownership | DB tests and e2e |
| Artist assignment ownership | DB tests and e2e, including equipment |
| Role permissions | `role-permissions`, `inventory-security` |
| Impersonation | Existing spec; audit names the admin |
| Customer-editable fields | Named fields only (tested indirectly); no generic update path |
| CSRF | Next server actions' origin check; not separately tested |
| Input validation | Zod in actions, repeated in services for the new flows |
| Rate limiting | Request, change, invite and setup actions. Not load-tested |
| Sensitive data | Withdrawn gig page discloses only the agency name and state |
| Token expiry | Existing tests |
| URL validation | `playlistLink` allowlist; links are shown, not embedded |
| Secret scan | gitleaks over all commits: see report |
| Dependency audit | 1 low, 1 moderate: see report |

## Unverified observations

- Refused pages return HTTP 200 with a "no access" page, because the refusal renders inside the stream. The data stays protected (14 pages checked in a browser), but monitoring or scripts can't rely on a 403 status.
- The dev overlay reports Next.js 16.4.2 installed where 16.4.5 is current. Not assessed.
- The demo agency has two profiles named "DJ Ruben". Looks like seed data; harmless.
- The public booking form doesn't check `writeBlocked`, so a read-only agency still receives
  inquiries, while the customer portal refuses them. Possibly intended; worth a product decision.
- The same push-then-refresh pattern as QA-10 remains in the sidebar's agency switcher, sign-out
  (`user-menu`) and the quote page's account setup (`q/[token]/account-setup`). Not seen failing;
  not changed.
- `OnboardingForm` uses a form action, which resets what was typed when validation fails. Not fixed.
