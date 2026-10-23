-- CreateTable
CREATE TABLE `leads` (
    `id` VARCHAR(64) NOT NULL,
    `reference` VARCHAR(12) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'new',
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(32) NULL,
    `locale` VARCHAR(8) NOT NULL DEFAULT 'nl',
    `eventType` VARCHAR(24) NOT NULL,
    `eventDate` DATE NULL,
    `startTime` VARCHAR(5) NULL,
    `venueName` VARCHAR(191) NULL,
    `venueCity` VARCHAR(96) NULL,
    `guestCount` INTEGER NULL,
    `budgetRange` VARCHAR(16) NULL,
    `preferredGenre` VARCHAR(96) NULL,
    `partnerName` VARCHAR(191) NULL,
    `ceremony` BOOLEAN NULL,
    `message` TEXT NULL,
    `assignedAgencyId` VARCHAR(64) NULL,
    `bookingId` VARCHAR(64) NULL,
    `closedReason` VARCHAR(191) NULL,
    `adminNotes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `leads_reference_key`(`reference`),
    UNIQUE INDEX `leads_bookingId_key`(`bookingId`),
    INDEX `leads_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lead_offers` (
    `id` VARCHAR(64) NOT NULL,
    `leadId` VARCHAR(64) NOT NULL,
    `agencyId` VARCHAR(64) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `respondedById` VARCHAR(64) NULL,
    `respondedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `lead_offers_agencyId_status_idx`(`agencyId`, `status`),
    UNIQUE INDEX `lead_offers_leadId_agencyId_key`(`leadId`, `agencyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `leads` ADD CONSTRAINT `leads_assignedAgencyId_fkey` FOREIGN KEY (`assignedAgencyId`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_offers` ADD CONSTRAINT `lead_offers_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `leads`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead_offers` ADD CONSTRAINT `lead_offers_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
