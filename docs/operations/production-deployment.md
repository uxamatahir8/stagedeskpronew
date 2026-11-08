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

The same check runs when the processes start (`apps/web/src/instrumentation.ts`, `apps/worker/src/index.ts`). With errors, the web server and the worker refuse to start. Set `TRUSTED_PROXIES=1` behind Caddy (required: without it the web server refuses to start, because every rate limit would key on an address the client chooses) and `HEALTH_TOKEN` for monitoring.

Also before launch (security QA, 8 Nov 2026):

- The app port must only be reachable through Caddy: bind Next to `127.0.0.1` or firewall the port. A client that reaches the port directly can still choose its own X-Forwarded-For.
- Set `SECRETS_KEY` to the current `BETTER_AUTH_SECRET` value first (stored secrets stay readable), so the auth secret can later be rotated on its own.
- Real Turnstile keys; live Stripe keys only in production.
- `WEB_INSTANCES` (staging deploy script) runs more web processes in PM2 cluster mode; pages render on one core per process.

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

## Go-live checklist (client QA report, 8 Nov 2026)

Code fixes for the report are in the app. These steps happen outside the code, in Stripe or on the server.

1. **Stripe webhook (SD-01).** In Stripe → Developers → Webhooks, add an endpoint for `https://<host>/api/webhooks/stripe` with the events in `handledStripeEvents` (`packages/payments/src/webhooks.ts`). Put its signing secret under Settings → Payment setup (or `STRIPE_WEBHOOK_SECRET`), then press "Test connection": it names the account and mode and warns when no signing secret is set. Admin → Payments & payouts shows a red card when deliveries fail the signature check. Events about agencies this database doesn't have (another environment sharing the Stripe account, deleted test agencies) are now "ignored", not retried until they give up. Replay the ones that gave up from the same page.
2. **Live mode (SD-09/SD-10).** Live keys and a new live webhook secret on production only. In Stripe → Settings → Business and Branding: business name (not "New Business"), logo, colours, support email, statement descriptor. Check that the production `APP_URL` is the production domain: canonical links, the sitemap, `og:url` and email links all follow it.
3. **Staging stays out of search engines (SD-09).** Automatic for an `APP_URL` starting with `staging.`; anywhere else set `SITE_NOINDEX=true`. Then robots.txt disallows everything, the sitemap is empty and every response has `X-Robots-Tag: noindex, nofollow`.
4. **Headers in one place (SD-19).** The app sets every security header (`next.config.ts`). Remove `X-Frame-Options`, `X-Content-Type-Options` and `Referrer-Policy` from the nginx/Caddy config: duplicates conflict (two Referrer-Policies), and a proxy-level `X-Frame-Options: SAMEORIGIN` breaks the embeddable booking form on agencies' own sites.
5. **Manual payment pass (SD-03), in test mode, before go-live.** Stripe's hosted pages can't be automated, so a person does this once:
   1. Agency → Payments → Connect Stripe; finish onboarding with Stripe's test data.
   2. Send a quote with a deposit; as the customer pay it with iDEAL (test bank) and once with card 4242 4242 4242 4242.
   3. Pay the balance; mark the event completed; check the payout split under Admin → Payments & payouts (agency, artist, platform fee) and in Stripe → Connect.
   4. Refund part of a payment from the booking; check the credit note and the refund in Stripe.
   5. Trigger a dispute with test card 4000 0000 0000 0259 and check the webhook is processed.
6. **Public forms (Turnstile).** Submit the booking page, `/request`, `/contact` and the newsletter form once from a normal browser with the real Turnstile keys.
7. **Plan VAT.** Settings → "VAT included in plan prices" (21% by default) attaches an inclusive tax rate to subscriptions: prices don't change, Stripe's invoices show the VAT part, and Checkout asks businesses for their VAT number. Reverse charge for EU businesses outside the Netherlands isn't handled; agree with the accountant whether that's needed.
8. **Deploys without a gap.** A deploy restarts the web process (`scripts/deploy-staging.sh`), which gave a short 502. Run `WEB_INSTANCES=2`, let the proxy retry for a few seconds (`lb_try_duration` in Caddy, `proxy_next_upstream` in nginx), and add uptime monitoring on `/api/health`.
9. **Domain (SD-20).** Production is `stagedeskpro.com`; the contact address is `info@stagedeskpro.com`. New installs get it as the default for the support and footer email. On a database that already exists (staging), the old values are stored: change them under Settings (general and footer), and update the privacy page and the help article "Booking page and form" in the admin, which were seeded with `stagedesk.pro`.
