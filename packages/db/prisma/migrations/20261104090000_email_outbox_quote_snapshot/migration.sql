-- AlterTable
ALTER TABLE `quotes` ADD COLUMN `eventSnapshot` JSON NULL;

-- CreateTable
CREATE TABLE `email_messages` (
    `id` VARCHAR(64) NOT NULL,
    `key` VARCHAR(191) NULL,
    `kind` VARCHAR(40) NOT NULL,
    `to` VARCHAR(191) NOT NULL,
    `job` JSON NULL,
    `agencyId` VARCHAR(64) NULL,
    `bookingId` VARCHAR(64) NULL,
    `status` VARCHAR(12) NOT NULL DEFAULT 'pending',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lastError` TEXT NULL,
    `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lockedUntil` DATETIME(3) NULL,
    `queuedAt` DATETIME(3) NULL,
    `sentAt` DATETIME(3) NULL,
    `providerMessageId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `email_messages_key_key`(`key`),
    INDEX `email_messages_status_nextAttemptAt_idx`(`status`, `nextAttemptAt`),
    INDEX `email_messages_bookingId_createdAt_idx`(`bookingId`, `createdAt`),
    INDEX `email_messages_agencyId_createdAt_idx`(`agencyId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `email_messages` ADD CONSTRAINT `email_messages_status_check` CHECK (`status` IN ('pending', 'queued', 'sending', 'sent', 'failed', 'dead') AND `attempts` >= 0);
