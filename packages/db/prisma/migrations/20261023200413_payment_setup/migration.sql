-- CreateTable
CREATE TABLE `platform_secrets` (
    `key` VARCHAR(64) NOT NULL,
    `ciphertext` TEXT NOT NULL,
    `hint` VARCHAR(48) NOT NULL,
    `updatedById` VARCHAR(64) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_claims` (
    `id` VARCHAR(64) NOT NULL,
    `organizationId` VARCHAR(64) NOT NULL,
    `bookingId` VARCHAR(64) NOT NULL,
    `customerId` VARCHAR(64) NULL,
    `method` VARCHAR(24) NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `amountCents` INTEGER NOT NULL,
    `paidOn` DATE NOT NULL,
    `reference` VARCHAR(191) NULL,
    `note` TEXT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `reviewedById` VARCHAR(64) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `rejectReason` VARCHAR(191) NULL,
    `paymentId` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `payment_claims_paymentId_key`(`paymentId`),
    INDEX `payment_claims_organizationId_status_idx`(`organizationId`, `status`),
    INDEX `payment_claims_bookingId_idx`(`bookingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `payment_claims` ADD CONSTRAINT `payment_claims_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_claims` ADD CONSTRAINT `payment_claims_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
