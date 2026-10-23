-- AlterTable
ALTER TABLE `organizations` ADD COLUMN `referralCode` VARCHAR(24) NULL;

-- CreateTable
CREATE TABLE `affiliates` (
    `id` VARCHAR(64) NOT NULL,
    `userId` VARCHAR(64) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `code` VARCHAR(24) NOT NULL,
    `promoCode` VARCHAR(24) NOT NULL,
    `stripePromotionCodeId` VARCHAR(64) NULL,
    `website` VARCHAR(191) NULL,
    `pitch` TEXT NULL,
    `commissionBps` INTEGER NULL,
    `stripeAccountId` VARCHAR(64) NULL,
    `payoutsEnabled` BOOLEAN NOT NULL DEFAULT false,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `affiliates_userId_key`(`userId`),
    UNIQUE INDEX `affiliates_code_key`(`code`),
    UNIQUE INDEX `affiliates_promoCode_key`(`promoCode`),
    UNIQUE INDEX `affiliates_stripeAccountId_key`(`stripeAccountId`),
    INDEX `affiliates_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `affiliate_clicks` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `affiliateId` VARCHAR(64) NOT NULL,
    `campaign` VARCHAR(48) NULL,
    `landingPath` VARCHAR(191) NULL,
    `visitorHash` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `affiliate_clicks_affiliateId_createdAt_idx`(`affiliateId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `referrals` (
    `id` VARCHAR(64) NOT NULL,
    `agencyId` VARCHAR(64) NOT NULL,
    `type` VARCHAR(16) NOT NULL,
    `affiliateId` VARCHAR(64) NULL,
    `referringAgencyId` VARCHAR(64) NULL,
    `source` VARCHAR(16) NOT NULL,
    `campaign` VARCHAR(48) NULL,
    `commissionBps` INTEGER NOT NULL DEFAULT 0,
    `commissionMonths` INTEGER NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'active',
    `rejectReason` VARCHAR(64) NULL,
    `firstPaidAt` DATETIME(3) NULL,
    `rewardedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `referrals_agencyId_key`(`agencyId`),
    INDEX `referrals_affiliateId_createdAt_idx`(`affiliateId`, `createdAt`),
    INDEX `referrals_referringAgencyId_idx`(`referringAgencyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commissions` (
    `id` VARCHAR(64) NOT NULL,
    `affiliateId` VARCHAR(64) NOT NULL,
    `referralId` VARCHAR(64) NOT NULL,
    `agencyId` VARCHAR(64) NOT NULL,
    `stripeInvoiceId` VARCHAR(80) NOT NULL,
    `stripePaymentIntentId` VARCHAR(64) NULL,
    `baseCents` INTEGER NOT NULL,
    `commissionBps` INTEGER NOT NULL,
    `amountCents` INTEGER NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `availableAt` DATETIME(3) NOT NULL,
    `cancelReason` VARCHAR(64) NULL,
    `payoutId` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `commissions_stripeInvoiceId_key`(`stripeInvoiceId`),
    INDEX `commissions_affiliateId_status_idx`(`affiliateId`, `status`),
    INDEX `commissions_status_availableAt_idx`(`status`, `availableAt`),
    INDEX `commissions_stripePaymentIntentId_idx`(`stripePaymentIntentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `affiliate_payouts` (
    `id` VARCHAR(64) NOT NULL,
    `affiliateId` VARCHAR(64) NOT NULL,
    `amountCents` INTEGER NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `stripeTransferId` VARCHAR(64) NULL,
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `affiliate_payouts_stripeTransferId_key`(`stripeTransferId`),
    INDEX `affiliate_payouts_affiliateId_createdAt_idx`(`affiliateId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `affiliate_assets` (
    `id` VARCHAR(64) NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `title` JSON NOT NULL,
    `description` JSON NULL,
    `url` VARCHAR(500) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `organizations_referralCode_key` ON `organizations`(`referralCode`);

-- AddForeignKey
ALTER TABLE `affiliates` ADD CONSTRAINT `affiliates_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_clicks` ADD CONSTRAINT `affiliate_clicks_affiliateId_fkey` FOREIGN KEY (`affiliateId`) REFERENCES `affiliates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `referrals` ADD CONSTRAINT `referrals_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `referrals` ADD CONSTRAINT `referrals_affiliateId_fkey` FOREIGN KEY (`affiliateId`) REFERENCES `affiliates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `referrals` ADD CONSTRAINT `referrals_referringAgencyId_fkey` FOREIGN KEY (`referringAgencyId`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commissions` ADD CONSTRAINT `commissions_affiliateId_fkey` FOREIGN KEY (`affiliateId`) REFERENCES `affiliates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commissions` ADD CONSTRAINT `commissions_referralId_fkey` FOREIGN KEY (`referralId`) REFERENCES `referrals`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commissions` ADD CONSTRAINT `commissions_payoutId_fkey` FOREIGN KEY (`payoutId`) REFERENCES `affiliate_payouts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `affiliate_payouts` ADD CONSTRAINT `affiliate_payouts_affiliateId_fkey` FOREIGN KEY (`affiliateId`) REFERENCES `affiliates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
