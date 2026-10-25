-- AlterTable
ALTER TABLE `artists` ADD COLUMN `lendable` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `artist_requests` (
    `id` VARCHAR(64) NOT NULL,
    `bookingId` VARCHAR(64) NOT NULL,
    `borrowerId` VARCHAR(64) NOT NULL,
    `lenderId` VARCHAR(64) NOT NULL,
    `artistId` VARCHAR(64) NOT NULL,
    `feeCents` INTEGER NOT NULL,
    `currency` VARCHAR(3) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `offeredBy` VARCHAR(8) NOT NULL DEFAULT 'borrower',
    `message` TEXT NULL,
    `createdById` VARCHAR(64) NULL,
    `respondedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `artist_requests_borrowerId_status_idx`(`borrowerId`, `status`),
    INDEX `artist_requests_lenderId_status_idx`(`lenderId`, `status`),
    INDEX `artist_requests_bookingId_status_idx`(`bookingId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `artist_requests` ADD CONSTRAINT `artist_requests_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `artist_requests` ADD CONSTRAINT `artist_requests_borrowerId_fkey` FOREIGN KEY (`borrowerId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `artist_requests` ADD CONSTRAINT `artist_requests_lenderId_fkey` FOREIGN KEY (`lenderId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `artist_requests` ADD CONSTRAINT `artist_requests_artistId_fkey` FOREIGN KEY (`artistId`) REFERENCES `artists`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
