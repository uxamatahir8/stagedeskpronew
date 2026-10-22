-- AlterTable
ALTER TABLE `bookings` ADD COLUMN `disputed` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `feeSnapshot` JSON NULL,
    ADD COLUMN `paidOutAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `organizations` ADD COLUMN `feeRule` JSON NULL,
    ADD COLUMN `stripeCustomerId` VARCHAR(64) NULL;

-- AlterTable
ALTER TABLE `payments` ADD COLUMN `refundedCents` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `stripeChargeId` VARCHAR(64) NULL,
    ADD COLUMN `stripeCheckoutId` VARCHAR(80) NULL,
    ADD COLUMN `stripeFeeCents` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `stripePaymentIntentId` VARCHAR(64) NULL,
    ADD COLUMN `transferredAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `ledger_entries` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `organizationId` VARCHAR(64) NOT NULL,
    `bookingId` VARCHAR(64) NULL,
    `paymentId` VARCHAR(64) NULL,
    `type` VARCHAR(32) NOT NULL,
    `party` VARCHAR(16) NOT NULL,
    `amountCents` INTEGER NOT NULL,
    `artistId` VARCHAR(64) NULL,
    `stripeObjectId` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ledger_entries_organizationId_createdAt_idx`(`organizationId`, `createdAt`),
    INDEX `ledger_entries_bookingId_idx`(`bookingId`),
    INDEX `ledger_entries_artistId_type_idx`(`artistId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `plans` (
    `id` VARCHAR(64) NOT NULL,
    `key` VARCHAR(48) NOT NULL,
    `name` JSON NOT NULL,
    `description` JSON NULL,
    `monthlyPriceCents` INTEGER NOT NULL,
    `yearlyPriceCents` INTEGER NOT NULL,
    `trialDays` INTEGER NOT NULL DEFAULT 14,
    `features` JSON NOT NULL,
    `limits` JSON NOT NULL,
    `feeRule` JSON NULL,
    `recommended` BOOLEAN NOT NULL DEFAULT false,
    `visible` BOOLEAN NOT NULL DEFAULT true,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `position` INTEGER NOT NULL DEFAULT 0,
    `stripeProductId` VARCHAR(64) NULL,
    `stripeMonthlyPriceId` VARCHAR(64) NULL,
    `stripeYearlyPriceId` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `plans_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscriptions` (
    `id` VARCHAR(64) NOT NULL,
    `organizationId` VARCHAR(64) NOT NULL,
    `planId` VARCHAR(64) NOT NULL,
    `status` VARCHAR(24) NOT NULL,
    `interval` VARCHAR(8) NOT NULL DEFAULT 'month',
    `stripeSubscriptionId` VARCHAR(64) NULL,
    `trialEndsAt` DATETIME(3) NULL,
    `currentPeriodEnd` DATETIME(3) NULL,
    `cancelAtPeriodEnd` BOOLEAN NOT NULL DEFAULT false,
    `pastDueSince` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `subscriptions_organizationId_key`(`organizationId`),
    UNIQUE INDEX `subscriptions_stripeSubscriptionId_key`(`stripeSubscriptionId`),
    INDEX `subscriptions_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `connected_accounts` (
    `id` VARCHAR(64) NOT NULL,
    `organizationId` VARCHAR(64) NOT NULL,
    `artistId` VARCHAR(64) NULL,
    `stripeAccountId` VARCHAR(64) NOT NULL,
    `chargesEnabled` BOOLEAN NOT NULL DEFAULT false,
    `payoutsEnabled` BOOLEAN NOT NULL DEFAULT false,
    `detailsSubmitted` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `connected_accounts_artistId_key`(`artistId`),
    UNIQUE INDEX `connected_accounts_stripeAccountId_key`(`stripeAccountId`),
    INDEX `connected_accounts_organizationId_idx`(`organizationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stripe_events` (
    `id` VARCHAR(80) NOT NULL,
    `type` VARCHAR(80) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'received',
    `error` TEXT NULL,
    `payload` JSON NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processedAt` DATETIME(3) NULL,

    INDEX `stripe_events_status_receivedAt_idx`(`status`, `receivedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `organizations_stripeCustomerId_key` ON `organizations`(`stripeCustomerId`);

-- CreateIndex
CREATE UNIQUE INDEX `payments_stripeCheckoutId_key` ON `payments`(`stripeCheckoutId`);

-- CreateIndex
CREATE UNIQUE INDEX `payments_stripePaymentIntentId_key` ON `payments`(`stripePaymentIntentId`);

-- AddForeignKey
ALTER TABLE `ledger_entries` ADD CONSTRAINT `ledger_entries_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ledger_entries` ADD CONSTRAINT `ledger_entries_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ledger_entries` ADD CONSTRAINT `ledger_entries_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `payments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `subscriptions_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `connected_accounts` ADD CONSTRAINT `connected_accounts_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `connected_accounts` ADD CONSTRAINT `connected_accounts_artistId_fkey` FOREIGN KEY (`artistId`) REFERENCES `artists`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
