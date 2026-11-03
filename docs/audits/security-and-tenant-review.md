# Security and tenant review (client-feedback branch)

Scope: the new and changed code on `feat/client-feedback-production-hardening`, plus
two repository-wide mechanical checks. Earlier reviews (`docs/audits/security-review.md`,
`multi-tenant-review.md`) cover the rest and were not repeated.

## Repository-wide checks

| Check | How | Result |
|---|---|---|
| Every exported server action authenticates first | Script over all 57 `"use server"` files (234 exported functions), flagging bodies without `require*`, `getSession`, `auth.api`, a token or rate limit in the first lines; the 25 flagged were read by hand | All 25 authenticate through local wrappers (`gate()` in booking equipment actions, `ownArtist()`, `requireAffiliate()`, `editor()` in website actions). The 3 in `lib/site-actions.ts` (waitlist, contact, display currency) are intentionally public. **No missing auth found.** |
| Raw SQL outside the tenant client in the web app | `grep $queryRaw/$executeRaw apps/web/src` | Only `api/health` (`SELECT 1`). |
| Unscoped `prisma.` reads in agency pages | grep pages using `requireAgency` that read bookings/quotes/payments/assignments through `prisma` | 3 pages; all are the documented cross-agency reads (an artist's own gigs, an owning agency's lent artist's gig dates). |

## New surfaces

| Surface | Threat | Control | Test |
|---|---|---|---|
| `/d/<token>` details link (CF-07) | Guessing, replay, use after the deal, editing another agency's booking | 32-byte random token, only its sha256 stored; expiry 1–30 days; single use re-checked under the booking row lock; revoked by a newer link; refused once a quote is accepted; one response for every invalid link (no oracle); IP rate limit 10/10 min; `noindex`; not frameable (only `/embed/*` is); `d` reserved as a page slug. Creation goes through `tenantDb` (cross-agency booking id → `not_found`). | `packages/db/src/detail-requests.test.ts` (5) |
| Agency email sender (CF-10) | Spoofing another domain; header injection | Only the display name and Reply-To change; From address stays `MAIL_FROM`. Display name strips `" \ CR LF < >`, max 100 chars; Reply-To must look like one address. Security mail kinds (verify, login code, reset, setup, invitation) ignore any sender. Test email rate-limited 5/hour per agency. Sender changes audited. | `packages/emails/src/templates.test.tsx` (header injection, address kept) |
| Invoice background upload (CF-13) | Stored XSS/HTML as image, path traversal, cross-agency file use, SSRF | Magic-byte check (`detectImage`), PNG/JPEG only, 4 MB; stored under `organizations/<id>/invoice/` with a random name; template schema only accepts `/files/organizations/…` paths without `..`; renderers re-check the path belongs to the invoice's agency before loading; files are read from our own bucket, never fetched by URL. | `packages/core/src/invoice-template.test.ts` |
| Typed invoice numbers (CF-12) | Reuse, races, injection into PDF/filename | Pattern `[A-Z0-9][A-Z0-9-_/.]{0,31}`; unique index `(organizationId, number)` turns a race into `invoice_number_taken`; only for people with `agency.settings` and only when the agency enabled it; audited. | `booking-options.test.ts` (race, reuse, case) |
| Platform artist support (CF-14) | Platform action by agency staff; unaudited removal; destroying history | Page and actions require `platform.agencies`; impersonation button additionally `platform.users`. Every action requires a reason and writes an audit row; delete refused when any assignment, ledger row, review or request exists; relink refuses platform admins and agency team members. Withdrawals go through the booking state machine (`release_artist`). | `artist-admin.test.ts` (4) |
| Resend confirmation (CF-17) | Mail bombing, verifying without proof | 3/hour per user; refused for disabled or verified accounts; never sets `emailVerified`; audited. | Covered in e2e spec (not run green in this session) |
| Batch equipment (CF-02) | Partial writes, serial collisions under races | One transaction; agency row lock serialises serial checks; unique code index. | `inventory-batch.test.ts` (9, incl. race) |
| Fixed artist fees (CF-06) | Paying more than received, double payment across payouts | Cut capped at what the payment has left after fees; pending payout operations' cuts counted under the payment lock; idempotent operations unchanged. | `compensation.test.ts`, `money-flow.test.ts` (fixed fee ×2) |

## Findings fixed on this branch

1. **Historical documents lost their logo** (`agency-settings/actions.ts`): replacing or removing the logo deleted the file that issued invoices print. Files are now kept once the agency has invoices.
2. **Silent unlink of an artist account** (`artists/actions.ts`): saving the artist form re-validated the linked user as a linkable artist member and set `userId` to null otherwise. The current link is now kept as is.

## Not covered here

CSRF relies on Next.js server actions' origin check (unchanged). Webhooks, Stripe secrets, sessions and 2FA were not re-reviewed on this branch.
