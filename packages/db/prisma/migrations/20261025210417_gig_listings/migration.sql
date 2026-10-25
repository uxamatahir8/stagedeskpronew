-- AlterTable
ALTER TABLE `artists` ADD COLUMN `headline` VARCHAR(160) NULL,
    ADD COLUMN `priceFromCents` INTEGER NULL;

-- AlterTable
ALTER TABLE `bookings` ADD COLUMN `listingId` VARCHAR(64) NULL;

-- AlterTable
ALTER TABLE `plans` ADD COLUMN `audience` VARCHAR(8) NOT NULL DEFAULT 'agency';

-- CreateTable
CREATE TABLE `gig_listings` (
    `id` VARCHAR(64) NOT NULL,
    `organizationId` VARCHAR(64) NOT NULL,
    `artistId` VARCHAR(64) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `description` TEXT NULL,
    `priceCents` INTEGER NOT NULL,
    `vatBps` INTEGER NOT NULL,
    `depositBps` INTEGER NOT NULL DEFAULT 3000,
    `durationMinutes` INTEGER NULL,
    `eventTypes` JSON NULL,
    `photoUrl` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `position` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `gig_listings_organizationId_active_idx`(`organizationId`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `bookings` ADD CONSTRAINT `bookings_listingId_fkey` FOREIGN KEY (`listingId`) REFERENCES `gig_listings`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gig_listings` ADD CONSTRAINT `gig_listings_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `gig_listings` ADD CONSTRAINT `gig_listings_artistId_fkey` FOREIGN KEY (`artistId`) REFERENCES `artists`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
