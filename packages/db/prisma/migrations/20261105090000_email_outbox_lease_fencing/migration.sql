-- A unique token fences each outbox lease. A worker whose lease expired can
-- no longer mark a message sent/failed after another worker reclaimed it.
ALTER TABLE `email_messages` ADD COLUMN `leaseToken` VARCHAR(64) NULL;

ALTER TABLE `email_messages` DROP CHECK `email_messages_status_check`;
ALTER TABLE `email_messages` ADD CONSTRAINT `email_messages_status_check`
  CHECK (`status` IN ('pending', 'queued', 'sending', 'sent', 'suppressed', 'failed', 'dead') AND `attempts` >= 0);
