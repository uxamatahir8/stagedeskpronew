-- CreateTable
CREATE TABLE `credit_notes` (
    `id` VARCHAR(64) NOT NULL,
    `organizationId` VARCHAR(64) NOT NULL,
    `bookingId` VARCHAR(64) NOT NULL,
    `invoiceId` VARCHAR(64) NOT NULL,
    `sourceKey` VARCHAR(191) NOT NULL,
    `number` VARCHAR(32) NOT NULL,
    `issuedAt` DATETIME(3) NOT NULL,
    `subtotalCents` INTEGER NOT NULL,
    `vatCents` INTEGER NOT NULL,
    `totalCents` INTEGER NOT NULL,
    `vatGroups` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `credit_notes_sourceKey_key`(`sourceKey`),
    INDEX `credit_notes_bookingId_idx`(`bookingId`),
    INDEX `credit_notes_invoiceId_idx`(`invoiceId`),
    UNIQUE INDEX `credit_notes_organizationId_number_key`(`organizationId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `credit_notes` ADD CONSTRAINT `credit_notes_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_notes` ADD CONSTRAINT `credit_notes_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `bookings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_notes` ADD CONSTRAINT `credit_notes_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `invoices`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
