-- CreateTable
CREATE TABLE `platform_promo_codes` (
    `id` VARCHAR(64) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `description` VARCHAR(191) NULL,
    `discountType` VARCHAR(16) NOT NULL,
    `percentBps` INTEGER NULL,
    `amountCents` INTEGER NULL,
    `duration` VARCHAR(16) NOT NULL,
    `durationMonths` INTEGER NULL,
    `planKeys` JSON NOT NULL,
    `firstSubscriptionOnly` BOOLEAN NOT NULL DEFAULT true,
    `maxRedemptions` INTEGER NULL,
    `expiresAt` DATETIME(3) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `stripeCouponId` VARCHAR(64) NULL,
    `stripePromotionCodeId` VARCHAR(64) NULL,
    `createdById` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `platform_promo_codes_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_promo_redemptions` (
    `id` VARCHAR(64) NOT NULL,
    `promoCodeId` VARCHAR(64) NOT NULL,
    `agencyId` VARCHAR(64) NOT NULL,
    `stripeSubscriptionId` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `platform_promo_redemptions_agencyId_idx`(`agencyId`),
    UNIQUE INDEX `platform_promo_redemptions_promoCodeId_agencyId_key`(`promoCodeId`, `agencyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking_promo_codes` (
    `id` VARCHAR(64) NOT NULL,
    `organizationId` VARCHAR(64) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `description` VARCHAR(191) NULL,
    `discountType` VARCHAR(16) NOT NULL,
    `percentBps` INTEGER NULL,
    `amountCents` INTEGER NULL,
    `minTotalCents` INTEGER NULL,
    `validFrom` DATETIME(3) NULL,
    `validUntil` DATETIME(3) NULL,
    `maxRedemptions` INTEGER NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `booking_promo_codes_organizationId_code_key`(`organizationId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking_promo_redemptions` (
    `id` VARCHAR(64) NOT NULL,
    `organizationId` VARCHAR(64) NOT NULL,
    `promoCodeId` VARCHAR(64) NOT NULL,
    `bookingId` VARCHAR(64) NOT NULL,
    `addedBy` VARCHAR(16) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `booking_promo_redemptions_bookingId_key`(`bookingId`),
    INDEX `booking_promo_redemptions_organizationId_promoCodeId_idx`(`organizationId`, `promoCodeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `platform_promo_redemptions` ADD CONSTRAINT `platform_promo_redemptions_promoCodeId_fkey` FOREIGN KEY (`promoCodeId`) REFERENCES `platform_promo_codes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `platform_promo_redemptions` ADD CONSTRAINT `platform_promo_redemptions_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_promo_codes` ADD CONSTRAINT `booking_promo_codes_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_promo_redemptions` ADD CONSTRAINT `booking_promo_redemptions_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_promo_redemptions` ADD CONSTRAINT `booking_promo_redemptions_promoCodeId_fkey` FOREIGN KEY (`promoCodeId`) REFERENCES `booking_promo_codes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_promo_redemptions` ADD CONSTRAINT `booking_promo_redemptions_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

