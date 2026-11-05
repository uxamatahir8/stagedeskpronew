-- Open artist requests nobody can answer. READ ONLY: run it with an account that
-- can only SELECT if one exists; the read-only transaction refuses writes either way.
-- It shows no email addresses, names of people, or customer details: only the agency,
-- the booking code, the date and the stage name the agency chose.
--
-- The reasons mirror artistStateOf() in packages/db/src/artist-accounts.ts, checked in
-- the same order, so a row here is a profile the app calls that state.
-- See docs/operations/artist-assignment-remediation.md for what to do with the results.

START TRANSACTION READ ONLY;

-- Per reason, per agency: how big it is.
SELECT o.slug AS agency, state.reason, COUNT(*) AS open_requests, MIN(b.eventDate) AS first_event
FROM booking_assignments ba
JOIN bookings b ON b.id = ba.bookingId
JOIN organizations o ON o.id = b.organizationId
JOIN (
  SELECT a.id,
    CASE
      WHEN a.userId IS NULL THEN 'no_account'
      WHEN u.id IS NULL THEN 'account_row_missing'
      WHEN u.disabledAt IS NOT NULL THEN 'disabled'
      WHEN m.id IS NULL THEN 'not_member'
      WHEN a.active = 0 THEN 'inactive'
      WHEN NOT EXISTS (SELECT 1 FROM accounts c WHERE c.userId = u.id) THEN 'setup_pending'
      ELSE 'active'
    END AS reason
  FROM artists a
  LEFT JOIN users u ON u.id = a.userId
  LEFT JOIN members m ON m.userId = a.userId AND m.organizationId = a.organizationId AND m.role IN ('artist', 'solo_artist')
) state ON state.id = ba.artistId
WHERE ba.status = 'pending' AND b.status IN ('booked', 'confirmed')
GROUP BY o.slug, state.reason
ORDER BY state.reason = 'active', o.slug, state.reason;

-- Each one that needs someone to act. `active` is left out: that artist can answer,
-- and setup_pending is listed because it's only fine if their setup email got out.
SELECT o.slug AS agency, b.trackingCode AS booking, b.eventDate, b.status AS booking_status,
  a.stageName, a.organizationId <> b.organizationId AS shared_artist, state.reason,
  ba.createdAt AS requested_at, DATEDIFF(UTC_DATE(), ba.createdAt) AS days_waiting,
  (SELECT e.status FROM email_messages e WHERE e.`key` LIKE CONCAT('artist-setup:%:', a.userId) ORDER BY e.createdAt DESC LIMIT 1) AS setup_email
FROM booking_assignments ba
JOIN bookings b ON b.id = ba.bookingId
JOIN organizations o ON o.id = b.organizationId
JOIN artists a ON a.id = ba.artistId
JOIN (
  SELECT a2.id,
    CASE
      WHEN a2.userId IS NULL THEN 'no_account'
      WHEN u.id IS NULL THEN 'account_row_missing'
      WHEN u.disabledAt IS NOT NULL THEN 'disabled'
      WHEN m.id IS NULL THEN 'not_member'
      WHEN a2.active = 0 THEN 'inactive'
      WHEN NOT EXISTS (SELECT 1 FROM accounts c WHERE c.userId = u.id) THEN 'setup_pending'
      ELSE 'active'
    END AS reason
  FROM artists a2
  LEFT JOIN users u ON u.id = a2.userId
  LEFT JOIN members m ON m.userId = a2.userId AND m.organizationId = a2.organizationId AND m.role IN ('artist', 'solo_artist')
) state ON state.id = ba.artistId
WHERE ba.status = 'pending' AND b.status IN ('booked', 'confirmed') AND state.reason <> 'active'
ORDER BY b.eventDate IS NULL, b.eventDate, o.slug;

ROLLBACK;
