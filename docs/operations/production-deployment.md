# Production deployment

Production has not been set up or deployed from this branch. This describes what a production release needs, based on the existing staging pipeline (`docs/staging-cicd.md`, `scripts/deploy-staging.sh`).

## Prerequisites (owner: platform operator)

| Item | Status |
|---|---|
| Production host, PM2 (web + worker), Caddy (TLS, reverse proxy) | NOT VERIFIED: not provisioned here |
| MySQL 8.4 with point-in-time recovery (binlog) and daily backups | NOT VERIFIED |
| Redis ≥ 6.2 (rate limits use EVAL; BullMQ) with persistence | NOT VERIFIED |
| S3-compatible storage with versioning for uploads | NOT VERIFIED |
| SMTP provider with SPF/DKIM/DMARC for `MAIL_FROM` | NOT VERIFIED |
| Stripe live keys, Connect enabled, webhook endpoint `/api/webhooks/stripe` sending exactly `handledStripeEvents` | NOT VERIFIED |
| Cloudflare Turnstile production keys | NOT VERIFIED |
| Wildcard DNS/TLS for agency sites (`SITES_BASE_DOMAIN`), CNAME target for custom domains | NOT VERIFIED |
| Visitor country header from the edge (`docs/operations/visitor-country.md`); without it, visitors in the Netherlands aren't detected | NOT VERIFIED |
| Error tracking (e.g. Sentry) and uptime/alerting on `/api/health` | Not integrated (no DSN available) |

## Environment

Check the production `.env` before every release:

```bash
node scripts/check-env.mjs /path/to/production/.env web
node scripts/check-env.mjs /path/to/production/.env worker
```

The same check runs when the processes start (`apps/web/src/instrumentation.ts`, `apps/worker/src/index.ts`). With errors, the web server and the worker refuse to start. Set `TRUSTED_PROXIES=1` behind Caddy and `HEALTH_TOKEN` for monitoring.

## Release steps

1. CI is green on the commit: `check` (lint, typecheck, migration drift, tests with Redis and stripe-mock, build), `security` (audit, gitleaks) and `e2e`.
2. Back up the database (`backup-restore.md`) and note the binlog position.
3. Same flow as staging: clone into a new release directory, `pnpm install --frozen-lockfile`, `pnpm db:generate`, `pnpm build`, `pnpm --filter @stagedesk/db run deploy` (migrations), switch the symlink, restart web then worker.
4. Health: `curl -fsS https://<host>/api/health` returns 200. Then `curl -H "Authorization: Bearer $HEALTH_TOKEN" …/api/health` shows `alerts: []` and a worker heartbeat younger than 180 s.
5. Watch for 30 minutes: Platform → Payments & payouts (no new "needs review"), Stripe events (no "gave up").

## Migrations in this branch

`20261101090000_financial_operations` and `20261101120000_newsletter_delivery_retries`. Both are additive: new nullable columns or columns with defaults, a new table, and indexes. The previous release keeps working against the new schema, so rolling back the code needs no schema rollback. The unique index `ledger_entries(operationId, type, party)` only covers rows with an `operationId`; existing rows have NULL and are unaffected.

## Rollback

Code: switch the symlink back and restart, as staging does automatically. The schema stays; see above. **Irreversible:** Stripe refunds, transfers and reversals already made. Operations left `pending` by a rolled-back release are continued by the worker of whichever release runs, since both releases share the table. Don't drop `financial_operations` on rollback.
