# Customer portal review

Client reports: "If logged in as customer, I cannot edit or see the event and fill in the
do's and don'ts, Spotify, etc." and "There is nothing in customer login that he can
create/request booking."

Status legend and evidence rules are in [full-role-based-qa.md](full-role-based-qa.md).

## Findings

| ID | Severity | Role | Page | Issue | Root Cause | Fix | Test Evidence | Status |
| -- | -------- | ---- | ---- | ----- | ---------- | --- | ------------- | ------ |
| CP-01 | Critical | Customer | My event | Customers couldn't edit or even see do's, don'ts, playlist or wishes. | The fields existed only in the agency's editor. | Edit Event Preferences dialog, `updateCustomerPreferences`. | e2e "the customer edits their wishes"; 7 DB tests | Fixed, missing feature |
| CP-02 | High | Customer | My event | Reference, agency, type, end time, address, guests and accepted-quote state weren't shown; the artist card vanished until one accepted. | Page showed a subset. | Full details card; the artist card says when none is assigned yet. | e2e "the event page shows the whole booking" | Fixed, missing feature |
| CP-03 | Critical | Customer | Dashboard | No way to request a booking. | The public form was the only route, and it isn't linked from the portal. | `/app/event/request`, Request Booking and Request Another Booking buttons, empty states with the button. | e2e "a customer without bookings requests one"; 5 DB tests | Fixed, missing feature |
| CP-04 | High | Customer | My event | No controlled way to change date, venue or guests after a quote. Agencies had to do it by message. | Missing feature. | `BookingChangeRequest`: direct before a quote is out, request afterwards; the agency approves or refuses. | e2e "after acceptance a date change waits for the agency"; 6 DB tests | Fixed, missing feature |
| CP-05 | High | Customer | My event | A customer of two agencies saw only the active agency's bookings; a link to the other showed the wrong booking with no hint. | Page is scoped to the active agency, correctly, but offered no way across. | "Bookings with other agencies" list that switches agency first. Nothing is mixed in. | No test exercises the list itself (see report) | Fixed, not specifically verified |
| CP-06 | Medium | Customer, Artist | Editors | Any http(s) address could be stored as a playlist from three forms, and customers and artists open whatever is stored. | Only `z.url`. | Core `playlistLink()` allowlist on the portal, the agency editor and the details link. Stored links are shown, never embedded. | `customer-event.test.ts`; DB and e2e refusal | Fixed, code defect |
| CP-07 | Medium | Customer, Artist | Bookings | When the agency changed an event, nobody was told. | `updateBookingDetails` only logged the event. | `notifyBriefChanged`: artist on any brief change, customer on contract changes, nobody when nothing changed. | "tells the artist and customer when the event changes" | Fixed, code defect |
| CP-08 | Medium | Customer | Dashboard | With several open bookings only the next was shown. | The home used a single booking. | "Your other bookings" list. | Crawl opens the page; the list itself has no assertion | Fixed, not specifically verified |
| CP-09 | Low | Agency | Bookings | "Bookings from the customer portal" had no label. | New source. | `via_customer_portal`, shown on the booking. | e2e "via klantportaal" | Fixed, code defect |
| CP-10 | Medium | Customer, Agency | Change requests | Found in review of this work, before release: retrying a change to several fields made a new request and told the agency again. | The retry check compared JSON as text, and MySQL reorders the keys. | Compared key by key. | "recognises a repeat of a change to several fields" (the test was not run against the old comparison) | Fixed, code defect |
| CP-11 | Medium | Customer, Agency | Change requests | Found in the same review: a change still waiting when a booking was cancelled kept an Approve button that could only fail. | Nothing closed it. | Cancelling, declining, completing or settling closes it. | "closes a waiting change when the booking is cancelled" | Fixed, code defect |
| CP-12 | Low | Agency | Edit details | Everything typed was wiped when a field was refused, which the stricter playlist check makes more likely. | React resets a form action when it finishes. | Submits without a form action. | Existing specs use the dialog; the kept-values case isn't asserted here | Fixed, not specifically verified |

## What customers can and can't change

| Field | Before a quote is out | Quote out or accepted | Event passed, cancelled, declined, completed, settled |
| ----- | --------------------- | --------------------- | ----------------------------------------------------- |
| Genres, do's, don'ts, playlist, music requests, special requests | Direct | Direct (does not outdate a quote) | Closed |
| Date, times, venue, address, type, guests | Direct | Change request | Closed |
| Totals, deposit, artist pay, equipment, status | Never | Never | Never |

The agency can turn customer editing of wishes off (Agency settings → Customer portal,
audited). Wishes stay editable by default, because the client's request was for customers
to fill these in themselves.

## Security

- Every operation starts from booking id and customer id together, so another customer's
  booking isn't found, even at the same agency. Tested for both.
- The services take named fields only; nothing from the form reaches a generic update.
- Approving a change goes through the same checks as an agency edit: a date the assigned
  artist or the reserved equipment can't follow is refused and the request stays open
  (tested for the artist, in the database and the browser; the equipment check is the
  existing `checkEquipmentReschedule`).
- `requestBookingAction` takes the agency from the person's own memberships, never from the
  form alone; the service checks the customer membership again.
- Saving nothing new records nothing and notifies nobody, so retries don't duplicate.
- Audit: `booking.customer_preferences`, `booking.customer_details`,
  `booking.change_requested`, `booking.change_approved`, `booking.change_rejected`,
  `agency.customer_portal`. Timeline entries name the person.

## Duplicate protection

1. The form sends a UUID; `@@unique([organizationId, clientRequestId])` lets one through
   even under simultaneous submits (tested with three at once).
2. Only that key marks a duplicate. Two requests with identical details but different keys are
   two bookings. (An earlier version also merged identical requests within 10 minutes; the
   review showed that swallows real requests, such as two DJs for one venue on one day, so it
   was removed.)
3. Only a new booking notifies anyone. A retry may re-offer the confirmation email, which its
   key stops from going out twice.

## Decisions

Confirmed by the product owner after the review; details in the
[final hardening report](../reports/customer-artist-final-hardening.md):

- **Monthly booking limit**: not applied when a request comes in. Read-only and suspended
  agencies are refused, with a neutral message. Whether a limit should apply at confirmation is
  an open question: the existing billing has no such rule, and this work didn't invent one.
- **Booking page off, or a plan without it**: customers can't request through the portal either.
- **Change decisions**: customers are told in the app and by email, on approval and on refusal.
- **Stale change requests**: refused when the fields concerned changed after the customer asked.
  A reviewer can still apply it after seeing the current values, and that is audited.
- **Budget**: the request form uses the existing budget ranges, not a free amount, to match
  the public form.
