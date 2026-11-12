# Open artist requests nobody can answer

For the person preparing a staging or production release. Before this release, a booking could
be assigned to a profile with no working login, and the request then waited unseen. The release
stops new ones (`assignArtist` refuses them), but it does not change existing records.

This procedure finds the existing ones. **Nothing here changes data by itself, and nothing
should be deleted or reassigned automatically**: whether a gig goes to another artist is the
agency's decision.

## 1. Find them

Run [artist-assignment-diagnostic.sql](artist-assignment-diagnostic.sql) against the environment,
with authorization for that environment:

```bash
mysql --defaults-extra-file=<credentials> <database> --table < docs/operations/artist-assignment-diagnostic.sql
```

The script runs inside a read-only transaction and shows no email addresses, personal names or
customer details. It has only been run locally so far; see the final hardening report.

## 2. What each reason means

| Reason | What's wrong | What the agency does in the app | Support-only step, if needed |
|---|---|---|---|
| `no_account` | Profile has no login | Artist page → **Invite artist** or **Link existing account**. Open requests reach the artist as soon as it's linked | None |
| `account_row_missing` | Profile points at a user that no longer exists. The foreign key should prevent this, so **treat it as a data fault** | Reassign the gig for now | Investigate before changing anything |
| `disabled` | The account is disabled | Reassign, or ask support whether the disabling still applies | Re-enable only after checking why it was disabled |
| `not_member` | The login is no longer an artist at this agency (usually a role change) | Invite or link another account, or restore the role under Team | None |
| `inactive` | The profile was deactivated, with a request still open | Reactivate the profile, or reassign | None |
| `setup_pending` | Account exists, no password yet. Fine if the setup email arrived | Artist page → **Resend setup email**. See `setup_email` | Check the outbox if it says `failed` or `dead` |

`setup_email` is the outbox status of the setup message. `sent` means the mail server accepted it,
not that it reached the inbox. Empty means no message under this key: accounts made before this
release used a different key, so empty alone proves nothing. Resending is safe: it replaces the
earlier link and doesn't create another account.

## 3. Order of work

1. Run the diagnostic and keep the output with the release record.
2. Soonest events first: the second query is sorted by date. Call those agencies rather than
   relying on a notice.
3. Each agency resolves its own rows with the actions above. The artist page and the artist list
   show the same state and offer the same actions.
4. Run the diagnostic again. Rows that are gone are resolved; a row moving to `setup_pending` is
   progress, not completion.

## 4. What not to do

- Don't change `booking_assignments`, `artists.userId` or `members` by hand: the app's actions also
  notify, audit and re-send the open requests.
- Don't mark assignments as accepted for someone.
- Don't send the output outside the team handling the release. Agency slugs and booking codes are
  business records.
