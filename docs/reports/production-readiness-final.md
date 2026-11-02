# Production readiness — client feedback branch

## Verdict: CONDITIONAL GO for staging deployment; NO-GO for production until the gates below are met

No known blocking defect remains in the code changed on this branch, and all local
verification passed. It is not production-ready yet because it has not run in CI or on
staging, several modules were not reviewed in this session, and some business
decisions are still open.

## Evidence (local, Windows dev machine, Docker services)

| Check | Result |
|---|---|
| `pnpm typecheck` | 7/7 packages |
| `pnpm lint` | 0 errors, 1 pre-existing warning |
| `pnpm test` | 485 passed, 0 failed, 0 skipped (core 216, emails 13, db 181, payments 57 incl. stripe-mock contract, web 18) |
| `pnpm build` | passes; 371 pages generated |
| Playwright full suite (25 specs) | First full run: 20 passed, 5 failed (30.6 min). Causes: 3 spec issues found and fixed (a fixed serial number clashing with the new serial rule, an email lookup, a time budget), 1 local data issue (the demo admin's name, run with `E2E_ADMIN_NAME`), 1 leftover test data issue (three test domains from earlier runs hitting the plan's domain limit, removed). Rerun of those 5: 4 passed, then sites passed after the cleanup. **All 25 specs have passed, but not all in one uninterrupted run.** |
| New `client-feedback.spec.ts` | passes end to end (2.8 min) |
| Migrations | all 39 apply to a freshly created database |
| `pnpm audit --prod` | 2 pre-existing advisories (low, moderate) in a dev-only CLI dependency |
| Secret scan | gitleaks not installed locally; regex scan of the diff found nothing |

Not done: GitHub CI run, staging deployment, staging UAT, visual check of invoice PDFs
with a background, mobile-device testing, screen-reader testing.

## Gates before production

1. Push the branch, open a PR to `staging`, get CI green (includes gitleaks).
2. Deploy to staging and run `prisma migrate deploy`; confirm the migration applies on
   staging data (CHECK constraints: verify no quote has `depositCents > totalCents`).
3. Staging UAT (below), with test tenants only.
4. Business decisions in the implementation report.
5. Correct `CLAUDE.md` on the default locale (it says Dutch without prefix; the code
   uses English without prefix).

## Recommended staging UAT

1. Add 4 identical lights with serials; try a repeated serial; mark one defective, then repaired.
2. Add equipment and a package from the booking page; check "free on this date".
3. Assign a DJ, check the email, accept as the DJ, tick items on the loading checklist, return them.
4. Create a booking from the calendar on a busy and a free day.
5. Artist with a fixed fee; booking paid by Stripe in deposit + balance; after the payout, compare transfers and ledger (`artist_share`, `owed_by_agency`).
6. Send a details link by email and by copy; submit; try it again; revoke a second one.
7. Dutch quote to an agency-entered customer; check every line, deposit, balance and PDF link; reply goes to the agency.
8. Quotes with no, percentage and fixed upfront payment; pay online and offline.
9. Typed invoice number, duplicate attempt, continuous series with prefix; invoice PDF with a background.
10. Support: take an artist off gigs, deactivate, relink, attempt to delete one with history; log in as artist; resend a confirmation.
