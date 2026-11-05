-- AlterTable
ALTER TABLE `bookings` ADD COLUMN `clientRequestId` VARCHAR(64) NULL,
    ADD COLUMN `musicRequests` TEXT NULL,
    ADD COLUMN `specialRequests` TEXT NULL;

-- AlterTable
ALTER TABLE `organizations` ADD COLUMN `customerPreferencesEditable` BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE `booking_change_requests` (
    `id` VARCHAR(64) NOT NULL,
    `organizationId` VARCHAR(64) NOT NULL,
    `bookingId` VARCHAR(64) NOT NULL,
    `status` VARCHAR(16) NOT NULL,
    `changes` JSON NOT NULL,
    `baseline` JSON NOT NULL,
    `note` TEXT NULL,
    `requestedById` VARCHAR(64) NOT NULL,
    `decidedById` VARCHAR(64) NULL,
    `decidedAt` DATETIME(3) NULL,
    `decisionNote` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `booking_change_requests_bookingId_status_idx`(`bookingId`, `status`),
    INDEX `booking_change_requests_organizationId_status_idx`(`organizationId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `bookings_organizationId_clientRequestId_key` ON `bookings`(`organizationId`, `clientRequestId`);

-- AddForeignKey
ALTER TABLE `booking_change_requests` ADD CONSTRAINT `booking_change_requests_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_change_requests` ADD CONSTRAINT `booking_change_requests_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
