# Production readiness — client feedback branch

## Verdict: CONDITIONAL GO

The branch is suitable for a staging deployment after its remote CI run is green. It
is not approved for production yet: this local review did not push, merge, deploy, or
perform staging UAT, and credit notes remain a product/accounting blocker for invoiced
refunds.

## Verified evidence

Environment: Windows development machine with Docker MySQL 8, Redis, Mailpit,
stripe-mock, and RustFS.

| Gate | Result |
|---|---|
| Install | `pnpm install --frozen-lockfile` passed |
| Prisma generation | passed |
| Migrations | all 40 applied to a new empty database; the new migration also applied over the populated development database |
| Lint | 0 errors; 1 pre-existing ARIA warning in `components/ui/select.tsx` |
| Typecheck | 7/7 packages passed |
| Unit/integration tests | 513 passed, 0 failed, 0 skipped: core 219, emails 13, db 184, payments 57, web 40 |
| Production build | passed; 371 routes generated |
| Browser tests | final acceptance run to be recorded below before handoff |
| PDF regression matrix | 13 generated PDFs / 26 rendered pages; page counts, page labels, clipping checks, and contact-sheet visual review passed |
| Dependency audit | high/critical gate passed; one low `deepmerge` and one moderate `minimatch` advisory remain under the `shadcn` CLI dependency |
| Secret scan | gitleaks 8.28.0: 155 commits, no leaks |
| Workflow syntax | `.github/workflows/ci.yml` parsed successfully |

The prior remote run, GitHub Actions run `41465701042`, failed in the check job because
the email outbox tests had no SMTP service. Its security job passed, and browser tests
did not run. This branch adds Mailpit to the check job, restores an isolated browser
job, and makes staging deployment depend on check, security, and browser success. No
new remote run exists because this review was explicitly performed without pushing.

## Material fixes in this continuation

- Email claims now carry a unique lease token. Completion and failure updates are
  fenced by that token, so a worker whose lease expired cannot overwrite a newer
  worker. Provider-suppressed mail is terminal `suppressed`, never falsely `sent`.
- CI now provisions the services the tests actually require, including Mailpit, and
  the browser suite runs against a fresh migrated and seeded database.
- PDF tests generate a self-contained matrix covering 1–4 pages, Dutch and English,
  quote and invoice variants, backgrounds, logos, saved templates, long descriptions,
  and legacy defaults. Multipage documents show the document number and `page x of y`
  (or Dutch equivalent).

## Gates before production

1. Push the branch, open a PR, and require a green check, security, and browser run.
2. Deploy to staging and run `prisma migrate deploy` against a backup-tested copy.
3. Run staging UAT with test tenants: mail delivery/retry/suppression, stale lease
   recovery, quote revision/acceptance races, payment and refund flows, PDF printing,
   custom domains, mobile layouts, and accessibility.
4. Design and validate credit notes before permitting refunds after an invoice has
   been issued.
5. Decide whether to replace or isolate the vulnerable `shadcn` CLI dependency and
   resolve the remaining combobox ARIA warning.

## Rollback and observability notes

The outbox migration is additive apart from replacing the email-status CHECK
constraint. Application rollback is safe while the new `leaseToken` column remains.
Before a database rollback, drain email workers and verify that no `suppressed` rows
exist, because the previous constraint does not recognize that state. Monitor queue
age, attempts, stale-lease recoveries, suppression count, SMTP/provider error class,
and duplicate Message-ID reports during staging.
