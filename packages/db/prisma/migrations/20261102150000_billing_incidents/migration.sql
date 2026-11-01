-- Billing incidents (duplicate live subscriptions) for operators. Additive.
-- CreateTable
CREATE TABLE `billing_incidents` (
    `id` VARCHAR(64) NOT NULL,
    `agencyId` VARCHAR(64) NOT NULL,
    `kind` VARCHAR(32) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'open',
    `openKey` VARCHAR(120) NULL,
    `data` JSON NOT NULL,
    `detectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `resolvedAt` DATETIME(3) NULL,
    `resolvedById` VARCHAR(64) NULL,
    `note` TEXT NULL,

    UNIQUE INDEX `billing_incidents_openKey_key`(`openKey`),
    INDEX `billing_incidents_status_detectedAt_idx`(`status`, `detectedAt`),
    INDEX `billing_incidents_agencyId_idx`(`agencyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

