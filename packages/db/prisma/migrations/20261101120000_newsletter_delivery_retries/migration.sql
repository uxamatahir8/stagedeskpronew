-- Newsletter deliveries: per-delivery claim and retry with backoff. Additive; existing rows keep working (attempts 0, no lock).
-- AlterTable
ALTER TABLE `newsletter_deliveries` ADD COLUMN `attempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `lockedUntil` DATETIME(3) NULL,
    ADD COLUMN `nextAttemptAt` DATETIME(3) NULL;

