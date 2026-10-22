-- AlterTable
ALTER TABLE `artists` ADD COLUMN `mediaLinks` JSON NULL,
    ADD COLUMN `showOnBookingPage` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `bookings` ADD COLUMN `budgetRange` VARCHAR(16) NULL,
    ADD COLUMN `ceremony` BOOLEAN NULL,
    ADD COLUMN `preferredArtistId` VARCHAR(64) NULL,
    ADD COLUMN `preferredGenre` VARCHAR(96) NULL;

-- AlterTable
ALTER TABLE `organizations` ADD COLUMN `bookingIntro` TEXT NULL,
    ADD COLUMN `bookingPageEnabled` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `coverUrl` TEXT NULL,
    ADD COLUMN `faq` JSON NULL,
    ADD COLUMN `showReviews` BOOLEAN NOT NULL DEFAULT true;
