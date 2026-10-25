-- AlterTable
ALTER TABLE `lead_offers` ADD COLUMN `currency` VARCHAR(3) NULL,
    ADD COLUMN `depositBps` INTEGER NULL,
    ADD COLUMN `depositCents` INTEGER NULL,
    ADD COLUMN `quoteLines` JSON NULL,
    ADD COLUMN `quoteMessage` TEXT NULL,
    ADD COLUMN `quotedAt` DATETIME(3) NULL,
    ADD COLUMN `quotedById` VARCHAR(64) NULL,
    ADD COLUMN `source` VARCHAR(16) NOT NULL DEFAULT 'admin',
    ADD COLUMN `totalCents` INTEGER NULL,
    ADD COLUMN `validUntil` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `leads` ADD COLUMN `accessToken` VARCHAR(48) NULL,
    ADD COLUMN `broadcastAt` DATETIME(3) NULL,
    ADD COLUMN `latitude` DOUBLE NULL,
    ADD COLUMN `longitude` DOUBLE NULL,
    ADD COLUMN `region` VARCHAR(96) NULL;

-- AlterTable
ALTER TABLE `organizations` ADD COLUMN `acceptsLeads` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `latitude` DOUBLE NULL,
    ADD COLUMN `longitude` DOUBLE NULL,
    ADD COLUMN `serviceEventTypes` JSON NULL,
    ADD COLUMN `serviceRadiusKm` INTEGER NULL,
    ADD COLUMN `serviceRegions` JSON NULL;

-- CreateTable
CREATE TABLE `geo_cache` (
    `query` VARCHAR(191) NOT NULL,
    `latitude` DOUBLE NULL,
    `longitude` DOUBLE NULL,
    `city` VARCHAR(96) NULL,
    `region` VARCHAR(96) NULL,
    `country` VARCHAR(2) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`query`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `leads_accessToken_key` ON `leads`(`accessToken`);
