# Release checklist

| Gate | Where | Status for `feat/inventory` |
|---|---|---|
| Lint, typecheck | local + CI | PASS (local) |
| Unit and database tests (incl. concurrency, failure injection) | local + CI | see `docs/reports/production-hardening-final-report.md` |
| Stripe contract tests not skipped | CI (stripe-mock) | PASS locally (mock running); CI NOT VERIFIED |
| Migrations match schema | `prisma migrate diff --from-migrations … --exit-code` | PASS (local) |
| Production build | `pnpm build` | see final report |
| Playwright suite | `pnpm --filter @stagedesk/web e2e` | see final report |
| Dependency audit (high/critical) | CI | PASS (local: 1 moderate, 1 low) |
| Secret scan | CI (gitleaks) | PASS (local, 121 commits) |
| Production `.env` passes `scripts/check-env.mjs` | release host | NOT VERIFIED (no production env) |
| Stripe test-mode end-to-end (real API) | staging | NOT VERIFIED (no keys) |
| Backup taken and restore rehearsed | production | NOT VERIFIED |
| Monitoring polling `/api/health` with alerts routed | ops | NOT VERIFIED (not set up) |
| Named incident owner | business | NOT VERIFIED |
| Business decisions: commission clawback (F-33), data retention | business | OPEN |
