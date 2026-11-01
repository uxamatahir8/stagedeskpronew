# Backup and restore

**Status: NOT VERIFIED.** No backup or restore was run against production or staging in this pass. The RPO/RTO below are proposals for the owner to approve.

## Proposed targets

| | Proposal | Reasoning |
|---|---|---|
| RPO (database) | 15 minutes | Money and bookings; binlog shipping makes this cheap |
| RTO (database) | 2 hours | Restore the latest dump, then replay binlogs |
| RPO (uploads) | 24 hours | Logos and images, which can be uploaded again |

## What to back up

- MySQL: everything. `financial_operations`, `stripe_events` and `ledger_entries` are needed to reconcile with Stripe after a restore.
- S3 buckets `S3_BUCKET_PUBLIC` and `S3_BUCKET_PRIVATE`: turn on versioning, copy daily to another region or provider.
- `.env` and `SECRETS_KEY`: without `SECRETS_KEY` (or `BETTER_AUTH_SECRET`), the Stripe keys stored under Settings can't be decrypted. Keep them in a password manager, never in the database backup.
- Redis: queues only. After a loss, the worker re-creates its schedulers. Lost email jobs aren't recovered; reminders and newsletter deliveries are, because their state lives in MySQL.

## Procedure (to rehearse on disposable data)

```bash
# Backup
mysqldump --single-transaction --routines --triggers --set-gtid-purged=OFF -h $HOST -u $USER -p stagedesk | gzip > stagedesk-$(date +%F-%H%M).sql.gz
# Restore into a scratch database first, never over production
mysql -e "CREATE DATABASE stagedesk_restore"
gunzip -c stagedesk-….sql.gz | mysql stagedesk_restore
DATABASE_URL=mysql://…/stagedesk_restore pnpm --filter @stagedesk/db exec prisma migrate status   # must say "up to date"
```

## After a restore

Stripe may hold refunds, transfers or events newer than the restored data:

1. Replay Stripe events since the restore point: Stripe dashboard → Webhooks → resend. Events are stored once by id and processed idempotently.
2. Run the reconciliation in `financial-reconciliation.md` for the gap period.
3. Refunds or payouts made after the restore point have no operation row. They show up as dashboard refunds through `charge.refunded`; transfers need a manual check against `stripe transfers list --created[gte]=…`.
