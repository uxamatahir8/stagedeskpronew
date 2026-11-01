# Monitoring and alerting

## Signals

`GET /api/health` with `Authorization: Bearer $HEALTH_TOKEN` returns:

```json
{ "ok": true, "checks": { "database": {"ok":true,"ms":3}, "redis": {"ok":true,"ms":1} },
  "worker": { "heartbeatAgeSeconds": 42 }, "emailQueue": { "failed": 0, "waiting": 0, "delayed": 0 },
  "stripeEvents": { "failed": 0 }, "financialOperations": { "review": 0 }, "alerts": [] }
```

| Alert | Meaning | First action |
|---|---|---|
| HTTP 503 | Database or Redis unreachable | Check MySQL and Redis; the web app keeps forms up (in-memory rate limits) |
| `worker_down` | No heartbeat for 3 min: no emails, payouts, retries | `pm2 status stagedesk-worker`, logs |
| `stripe_events_dead` | An event failed 10 times | Platform → Payments & payouts → events, filter "Gave up", read the error, fix, "Process again" |
| `stripe_events_backlog` | More than 50 waiting or failed events | Usually Stripe keys or the DB; look at the errors |
| `financial_operations_review` | A refund or payout needs a person | See `financial-reconciliation.md` |
| `email_jobs_failed` | Email jobs out of retries | SMTP credentials and limits; BullMQ keeps the failed jobs |

Poll every minute from an external uptime monitor (public: status code only) and every 5 minutes with the token (alerts). No monitoring service is configured yet (owner: platform operator).

## Logs to alert on

`[finance] … needs review`, `[stripe] event … gave up`, `[config]` (start-up refused), `[rate-limit] Redis unavailable`, `[turnstile] … refusing`, `[team] seat check for invitation failed`.

Error tracking (Sentry or similar) is **not integrated**: it needs a DSN and an agreement on what personal data may be sent.
