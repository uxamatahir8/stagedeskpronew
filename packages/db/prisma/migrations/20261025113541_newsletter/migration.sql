-- CreateTable
CREATE TABLE `newsletter_subscribers` (
    `id` VARCHAR(64) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `locale` VARCHAR(5) NOT NULL DEFAULT 'nl',
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `source` VARCHAR(16) NOT NULL DEFAULT 'footer',
    `userId` VARCHAR(64) NULL,
    `token` VARCHAR(64) NOT NULL,
    `confirmedAt` DATETIME(3) NULL,
    `unsubscribedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `newsletter_subscribers_email_key`(`email`),
    UNIQUE INDEX `newsletter_subscribers_token_key`(`token`),
    INDEX `newsletter_subscribers_status_locale_idx`(`status`, `locale`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `newsletter_campaigns` (
    `id` VARCHAR(64) NOT NULL,
    `subjectNl` VARCHAR(191) NOT NULL,
    `subjectEn` VARCHAR(191) NOT NULL,
    `bodyNl` TEXT NOT NULL,
    `bodyEn` TEXT NOT NULL,
    `articleIds` JSON NOT NULL,
    `audience` VARCHAR(8) NOT NULL DEFAULT 'all',
    `status` VARCHAR(16) NOT NULL DEFAULT 'draft',
    `scheduledAt` DATETIME(3) NULL,
    `startedAt` DATETIME(3) NULL,
    `sentAt` DATETIME(3) NULL,
    `recipients` INTEGER NOT NULL DEFAULT 0,
    `sentCount` INTEGER NOT NULL DEFAULT 0,
    `failedCount` INTEGER NOT NULL DEFAULT 0,
    `createdById` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `newsletter_campaigns_status_scheduledAt_idx`(`status`, `scheduledAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `newsletter_deliveries` (
    `id` VARCHAR(64) NOT NULL,
    `campaignId` VARCHAR(64) NOT NULL,
    `subscriberId` VARCHAR(64) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'queued',
    `error` VARCHAR(500) NULL,
    `sentAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `newsletter_deliveries_campaignId_status_idx`(`campaignId`, `status`),
    UNIQUE INDEX `newsletter_deliveries_campaignId_subscriberId_key`(`campaignId`, `subscriberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `newsletter_deliveries` ADD CONSTRAINT `newsletter_deliveries_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `newsletter_campaigns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `newsletter_deliveries` ADD CONSTRAINT `newsletter_deliveries_subscriberId_fkey` FOREIGN KEY (`subscriberId`) REFERENCES `newsletter_subscribers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
