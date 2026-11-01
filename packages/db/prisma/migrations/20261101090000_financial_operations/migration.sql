-- Durable refunds/payouts (financial_operations), webhook claims and retries, ledger idempotency.
-- Additive only: new nullable columns, a new table and indexes; existing rows are untouched.
-- AlterTable
ALTER TABLE `ledger_entries` ADD COLUMN `operationId` VARCHAR(64) NULL;

-- AlterTable
ALTER TABLE `stripe_events` ADD COLUMN `attempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `lockedUntil` DATETIME(3) NULL,
    ADD COLUMN `nextAttemptAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `financial_operations` (
    `id` VARCHAR(64) NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `key` VARCHAR(120) NOT NULL,
    `organizationId` VARCHAR(64) NOT NULL,
    `bookingId` VARCHAR(64) NULL,
    `paymentId` VARCHAR(64) NULL,
    `amountCents` INTEGER NOT NULL,
    `currency` VARCHAR(3) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `data` JSON NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lastError` TEXT NULL,
    `nextAttemptAt` DATETIME(3) NULL,
    `lockedUntil` DATETIME(3) NULL,
    `actorId` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `completedAt` DATETIME(3) NULL,

    UNIQUE INDEX `financial_operations_key_key`(`key`),
    INDEX `financial_operations_status_nextAttemptAt_idx`(`status`, `nextAttemptAt`),
    INDEX `financial_operations_paymentId_status_idx`(`paymentId`, `status`),
    INDEX `financial_operations_organizationId_createdAt_idx`(`organizationId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `ledger_entries_stripeObjectId_idx` ON `ledger_entries`(`stripeObjectId`);

-- CreateIndex
CREATE UNIQUE INDEX `ledger_entries_operationId_type_party_key` ON `ledger_entries`(`operationId`, `type`, `party`);

-- CreateIndex
CREATE INDEX `stripe_events_status_nextAttemptAt_idx` ON `stripe_events`(`status`, `nextAttemptAt`);

