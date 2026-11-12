# Artist assignment review

Client report: "The agency artist login is not seeing the assigned request."

There was no single cause. Six separate defects could each produce that symptom, and
which one a given agency hit depended on its data. Status legend and evidence rules are in
[full-role-based-qa.md](full-role-based-qa.md).

**How this was established:** by reading the code and the demo data, then by tests written
against the fix. The defects were not reproduced in a browser on the old code before they
were fixed. The demo data does contain the exact case for AR-01: "DJ Ruben" and "Lotte Sax &
Beats" are active profiles with no user, and the old picker offered both.

## Findings

| ID | Severity | Role | Page | Issue | Root Cause | Fix | Test Evidence | Status |
| -- | -------- | ---- | ---- | ----- | ---------- | --- | ------------- | ------ |
| AR-01 | Critical | Agency, Artist | Booking → Artist | A profile with no login could be assigned. The agency saw "Request sent"; nobody could ever see or answer it, so the booking could never reach confirmed. | `bookableArtists()` only checks `active`. `assignArtist` then notifies `[null]` (a no-op) and `emailArtists` skips artists without a user. | New `artistAccountState()`. `assignArtist` refuses `no_account` and `not_member` (`artist_no_account`). The picker disables them and says why. | `customer-artist-portal.test.ts` "refuses a profile nobody can answer for"; e2e: Lotte Sax option disabled | Fixed, code defect |
| AR-02 | High | Artist | Dashboard, Gigs | Dashboard and Gigs page used different rules. Dashboard: booked/confirmed, future or undated. Gigs: also completed, no date rule. A request could show in one and not the other. | Two hand-written queries. | Core `gigState()` plus `artistGigs()` are the only source for dashboard, Gigs and badge. | `gigs.test.ts`; `customer-artist-portal.test.ts` "what an artist sees" | Fixed, code defect |
| AR-03 | High | Artist | Dashboard | `take: 20` ordered by date could cut a request off for busy artists. | The limit applied to requests and gigs together. | Open assignments are never limited; only closed history is (30). | "keeps every open request in view" (22 accepted gigs plus a far-future request) | Fixed, code defect |
| AR-04 | High | Artist | Gigs | An accepted gig with no date was filed under "past". | `(eventDate ?? "") < today`: the empty string sorts before any date. | `date_pending` state, listed as upcoming. | `gigs.test.ts`; e2e "an undated request stays visible" | Fixed, code defect |
| AR-05 | Medium | Artist | Dashboard, Gigs, email | Undated requests rendered as "Wedding · " with nothing after it, and the assignment email gave the date as "other". | Null date rendered as-is; the email used the event type's "other" translation as a fallback. | "Date not scheduled yet" (nl/en) everywhere. | e2e asserts "Datum nog niet bekend" on dashboard and Gigs | Fixed, code defect |
| AR-06 | Critical | Artist with several memberships | Gigs, gig detail | Someone who is an artist at agency A and a customer (or team member) at agency B, with B active, got a 403 from the notification and email links and had no Gigs menu. | `artist.gigs` came only from the role at the active agency. | `resolveViewer` adds `artist.gigs` when the user has an artist profile at an agency where they hold the artist role. Those pages only read the person's own assignments. Their requests also appear on any agency's home. | e2e "a shared artist's gig works across agencies, also from another active agency" | Fixed, code defect |
| AR-07 | Medium | Artist | Gig detail | A withdrawn or declined request gave a bare 404 from older notifications and emails. | The page only queried pending and accepted. | Says the request is no longer open and shows the state. Discloses nothing else about the booking. | e2e: Yara's link after declining | Fixed, code defect |
| AR-08 | High | Agency | Booking → Artist | "Request sent" appeared whatever happened to the notification. A failing notification also reported the whole action as failed although the assignment was saved. | Notification ran unguarded after the transaction; the message wasn't tied to the outcome. | `assignArtist` returns `notified`. The message says the request is saved and what didn't reach the artist. | "shows a new request with a notification and a count" covers the success path. The failure path has no test (see report, PARTIALLY DONE) | Fixed, success path verified |
| AR-09 | High | Agency, Artist | Booking → Artist | Disabled accounts could be assigned. | No check on `disabledAt`. | Refused with `artist_account_disabled`; shown in the picker. | "refuses a profile nobody can answer for" | Fixed, code defect |
| AR-10 | High | Agency, Artist | Team | Removing someone from the team left their artist profile linked, so they stayed reachable and kept message and equipment access through the assignment. | Nothing unlinked the profile on removal. | Better Auth `afterRemoveMember` hook calls `unlinkRemovedMember`; audited. | `staff-seats.test.ts` "artists leaving the team", through the real endpoint | Fixed, code defect |
| AR-11 | Medium | Artist | Artist requests | An artist lent between agencies got an in-app notice but no email. | `assignLentArtist` only notifies; the action never mailed. | The accept action emails the artist. | Not separately tested; existing lending specs run the path | Fixed, not specifically verified |
| AR-12 | Medium | Platform admin | Platform artists | Assigning an unavailable artist threw an uncaught server error and could leave a new share behind. | `assignPlatformArtistAction` didn't use `runAction`. | Wrapped, with the same messages as an agency. | Not specifically tested | Fixed, not specifically verified |
| AR-13 | Low | Agency | Artists | Two account errors were hard-coded in English for Dutch users. | Strings in `ArtistAccountError`. | Error codes, translated. | Typecheck of the message keys | Fixed, code defect |
| AR-14 | Medium | Artist | Sidebar | No pending-request count anywhere in the navigation. | Missing feature. | Badge next to Gigs from `pendingGigCount()`. | e2e `nav-badge-gigs` | Fixed, missing feature |
| AR-15 | Medium | Independent artist | Gigs | An independent artist assigned by another agency (platform admins can do this) had no page to see it on. | `solo_artist` has no `artist.gigs`. | Granted when they have a live gig from another agency. | "gives an independent artist a way to a request from another agency" (the grant rule, not the page in a browser) | Fixed, code defect |

| AR-16 | High | Artist | Gigs | With a long history, upcoming and undated gigs were on later pages behind the artist's oldest past gigs. | The list sorted everything by date ascending, past included. | Undated first, then soonest, then past gigs newest first. | Reproduced in a full browser run at 39 gigs on 2 pages; e2e "an undated request stays visible" now passes with that history | Fixed, reproduced browser defect |

## Profile, account, membership, assignment

| State | Meaning | Assignable | What the agency sees |
| ----- | ------- | ---------- | -------------------- |
| `no_account` | No user linked | No | "No login yet", with an invitation form on the artist's page |
| `not_member` | User no longer holds the artist role at the profile's agency | No | "No longer on the team" |
| `disabled` | Account disabled | No | "Account disabled" |
| `setup_pending` | Account made for them, no way to sign in yet | Yes, the email carries a first-password link | "Password not set yet", with a resend button |
| `active` | Can sign in | Yes | Nothing extra |

Inviting a profile (`inviteArtistAccountAction`) creates or links the account, and then
requests already waiting for that profile reach the artist, with a guard against a second
notification and the outbox key against a second email. Assignments made before this fix
to a profile with no login stay on the booking; the booking page now shows a warning with a
link to fix it.

## Assignment states

`gigState()` in `packages/core/src/gigs.ts`: `new_request` (pending, under 48 hours),
`pending_response`, `accepted`, `date_pending`, `completed`, `past`, `declined`, `withdrawn`,
`cancelled`.

## Regression matrix

| Case | Evidence |
| ---- | -------- |
| Artist linked to an existing user | DB test, e2e (DJ Sem) |
| Newly invited artist | e2e: invitation sent, setup mail received, panel changes |
| Artist without password | DB test `setup_pending`; e2e: assigned before first sign-in |
| Artist without user linkage | DB test; e2e picker |
| Shared artist | DB test; e2e (DJ Yara answers Feestband's request) |
| Platform-managed artist | DB test: shared from the platform organization, sees the gig. The admin screen's action has no test |
| Artist with several memberships | e2e: customer at one agency, artist at another |
| Undated booking | Core, DB and e2e |
| More than 20 other assignments | DB test |
| Pending and accepted assignments | DB, e2e |
| Reassigned booking | DB test: first artist's request files as withdrawn |
| Cancelled booking | DB test: files as cancelled |
| Disabled artist account | DB test |
| Incorrect account linkage | DB test `not_member`; `relinkArtistUser` covered by the existing `artist-admin.test.ts` |
| Email delivery failure | Message path added; existing `email-delivery.test.ts` covers the outbox, not this message (see report) |

## Before deploying

Requests already stuck can be found with the read-only
[diagnostic](../operations/artist-assignment-diagnostic.sql), which replaces the query that was
here: that one only found profiles with no login, not disabled accounts, lost memberships,
deactivated profiles or missing passwords. What to do with the results is in the
[remediation guide](../operations/artist-assignment-remediation.md).

It was tested on an isolated local database with one record per state. It has not been run
against staging or production.

## After the independent review

The access rule now lives in one place, `packages/db/src/artist-access.ts`, used by the
dashboard, gig list and details, answering, messages, equipment, earnings and notifications.
What each change does to an artist's access is in the
[final hardening report](../reports/customer-artist-final-hardening.md).
