# Incident response

Owner and on-call rota: **to be named by the business** (none exists yet).

| Incident | Detect | Contain | Recover |
|---|---|---|---|
| Database down | `/api/health` 503 | Nothing to contain; writes fail | Restore service; Stripe events are stored on arrival, so after recovery check for "Failed" and replay |
| Redis down | health 503, `[rate-limit] Redis unavailable` | Forms stay up (in-memory limits); emails fall back to direct sending in the web app; the worker stops | Restore Redis; the worker re-creates its schedulers; reminders not queued are retried by the next hourly run |
| Worker down | `worker_down` | — | Restart; due refunds/payouts, events, reminders and newsletters resume |
| SMTP failing | `email_jobs_failed`, newsletter failures | — | Fix credentials; BullMQ retries email jobs 5×; newsletter "Retry failed" |
| Stripe webhooks failing | `stripe_events_dead` / backlog | — | Fix cause, "Process again" per event; for missed deliveries use Stripe → Webhooks → resend |
| Duplicate or wrong money movement suspected | ledger queries in `financial-reconciliation.md` | Pause payouts: stop the worker or remove Stripe keys from Settings (payout and refund calls are skipped when Stripe isn't configured) | Reconcile against Stripe, correct with new ledger rows (never edit or delete) |
| Leaked secret | — | Rotate: Stripe keys (Settings), `BETTER_AUTH_SECRET` (signs everyone out), `SECRETS_KEY` (stored secrets must be entered again), SMTP, S3 | Audit log for actions in the exposure window |
| TLS/domain failure | uptime monitor | — | Caddy logs; for agency custom domains, the domain's verification status |
| Lost uploads | 404s on images | — | Restore from S3 versioning or the backup copy |
