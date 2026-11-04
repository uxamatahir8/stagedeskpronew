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
  (tested for the artist; the equipment check is the existing `checkEquipmentReschedule`).
- `requestBookingAction` takes the agency from the person's own memberships, never from the
  form alone; the service checks the customer membership again.
- Saving nothing new records nothing and notifies nobody, so retries don't duplicate.
- Audit: `booking.customer_preferences`, `booking.customer_details`,
  `booking.change_requested`, `booking.change_approved`, `booking.change_rejected`,
  `agency.customer_portal`. Timeline entries name the person.

## Duplicate protection

1. The form sends a UUID; `@@unique([organizationId, clientRequestId])` lets one through
   even under simultaneous submits (tested with three at once).
2. An identical request within 10 minutes (same customer, type, date, city, still an
   inquiry) returns the first booking, which covers a reloaded form.
3. Only a new booking notifies anyone or sends a confirmation.

## Decisions for you to confirm

- **Monthly booking limit**: not applied to customer requests, matching the public page,
  which also takes inquiries over the limit so the agency doesn't lose them. Read-only and
  suspended agencies are refused, with a neutral message.
- **Booking page off**: if an agency turns its public booking page off, its customers also
  can't request through the portal; they see a message and are pointed to contact the
  agency. If the portal should stay open in that case, it's a one-line change in
  `agencyTakesRequests`.
- **Change decisions**: customers hear about these in the app only, not by email.
- **Budget**: the request form uses the existing budget ranges, not a free amount, to match
  the public form.
