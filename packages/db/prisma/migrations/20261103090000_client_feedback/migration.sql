-- AlterTable
ALTER TABLE `artists` ADD COLUMN `compensationType` VARCHAR(16) NOT NULL DEFAULT 'percentage',
    ADD COLUMN `defaultFixedFeeCents` INTEGER NULL;

-- AlterTable
ALTER TABLE `booking_assignments` ADD COLUMN `compensationType` VARCHAR(16) NOT NULL DEFAULT 'percentage',
    ADD COLUMN `fixedFeeCents` INTEGER NULL;

-- AlterTable
ALTER TABLE `invoices` ADD COLUMN `manualNumber` BOOLEAN NOT NULL DEFAULT false,
    MODIFY `number` VARCHAR(32) NOT NULL;

-- AlterTable
ALTER TABLE `organizations` ADD COLUMN `allowManualInvoiceNumbers` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `correspondenceLocale` VARCHAR(8) NOT NULL DEFAULT 'nl',
    ADD COLUMN `defaultDepositBps` INTEGER NULL,
    ADD COLUMN `defaultDepositFixedCents` INTEGER NULL,
    ADD COLUMN `defaultDepositType` VARCHAR(16) NULL,
    ADD COLUMN `emailFromName` VARCHAR(120) NULL,
    ADD COLUMN `emailReplyTo` VARCHAR(191) NULL,
    ADD COLUMN `invoiceNumbering` VARCHAR(16) NOT NULL DEFAULT 'yearly',
    ADD COLUMN `invoicePrefix` VARCHAR(12) NULL,
    ADD COLUMN `invoiceTemplate` JSON NULL;

-- AlterTable
ALTER TABLE `quotes` ADD COLUMN `depositFixedCents` INTEGER NULL,
    ADD COLUMN `depositType` VARCHAR(16) NOT NULL DEFAULT 'percentage',
    ADD COLUMN `locale` VARCHAR(8) NULL;

-- CreateTable
CREATE TABLE `booking_detail_requests` (
    `id` VARCHAR(64) NOT NULL,
    `organizationId` VARCHAR(64) NOT NULL,
    `bookingId` VARCHAR(64) NOT NULL,
    `tokenHash` VARCHAR(64) NOT NULL,
    `locale` VARCHAR(8) NOT NULL DEFAULT 'nl',
    `bookingVersion` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `submittedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(64) NULL,
    `emailedTo` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `booking_detail_requests_tokenHash_key`(`tokenHash`),
    INDEX `booking_detail_requests_organizationId_bookingId_idx`(`organizationId`, `bookingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `booking_detail_requests` ADD CONSTRAINT `booking_detail_requests_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_detail_requests` ADD CONSTRAINT `booking_detail_requests_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Money rules Prisma can't express (none of these columns is in a foreign key).
ALTER TABLE `artists` ADD CONSTRAINT `artists_compensation_check` CHECK (`compensationType` IN ('percentage', 'fixed') AND (`defaultFixedFeeCents` IS NULL OR `defaultFixedFeeCents` >= 0));
ALTER TABLE `booking_assignments` ADD CONSTRAINT `booking_assignments_compensation_check` CHECK (`compensationType` IN ('percentage', 'fixed') AND (`fixedFeeCents` IS NULL OR `fixedFeeCents` >= 0) AND (`compensationType` = 'percentage' OR `fixedFeeCents` IS NOT NULL));
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_deposit_check` CHECK (`depositType` IN ('none', 'percentage', 'fixed') AND (`depositFixedCents` IS NULL OR `depositFixedCents` >= 0) AND `depositCents` >= 0 AND `depositCents` <= GREATEST(`totalCents`, 0));
ALTER TABLE `organizations` ADD CONSTRAINT `organizations_invoice_numbering_check` CHECK (`invoiceNumbering` IN ('yearly', 'continuous'));
