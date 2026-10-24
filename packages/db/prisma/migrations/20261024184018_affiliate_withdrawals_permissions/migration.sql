-- AlterTable
ALTER TABLE `affiliate_payouts` ADD COLUMN `details` JSON NULL,
    ADD COLUMN `method` VARCHAR(16) NOT NULL DEFAULT 'stripe',
    ADD COLUMN `paidAt` DATETIME(3) NULL,
    ADD COLUMN `reference` VARCHAR(16) NULL,
    ADD COLUMN `rejectReason` VARCHAR(300) NULL,
    ADD COLUMN `reviewedAt` DATETIME(3) NULL,
    ADD COLUMN `reviewedById` VARCHAR(64) NULL,
    ADD COLUMN `transactionRef` VARCHAR(120) NULL;

-- AlterTable
ALTER TABLE `affiliates` ADD COLUMN `payoutAccountName` VARCHAR(120) NULL,
    ADD COLUMN `payoutIban` VARCHAR(34) NULL,
    ADD COLUMN `payoutMethod` VARCHAR(16) NULL,
    ADD COLUMN `paypalEmail` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `organizations` ADD COLUMN `rolePermissions` JSON NULL;

-- CreateTable
CREATE TABLE `affiliate_payout_events` (
    `id` VARCHAR(64) NOT NULL,
    `payoutId` VARCHAR(64) NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `note` VARCHAR(500) NULL,
    `actorId` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `affiliate_payout_events_payoutId_createdAt_idx`(`payoutId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `affiliate_payouts_reference_key` ON `affiliate_payouts`(`reference`);

-- CreateIndex
CREATE INDEX `affiliate_payouts_status_idx` ON `affiliate_payouts`(`status`);

-- AddForeignKey
ALTER TABLE `affiliate_payout_events` ADD CONSTRAINT `affiliate_payout_events_payoutId_fkey` FOREIGN KEY (`payoutId`) REFERENCES `affiliate_payouts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
