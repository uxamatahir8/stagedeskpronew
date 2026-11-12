-- AlterTable
ALTER TABLE `bookings` ADD COLUMN `equipmentCheckedInAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `organizations` ADD COLUMN `artistsHandleEquipment` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `inventorySharing` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `equipment_categories` (
    `id` VARCHAR(64) NOT NULL,
    `organizationId` VARCHAR(64) NOT NULL,
    `name` VARCHAR(96) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `equipment_categories_organizationId_name_key`(`organizationId`, `name`),
    UNIQUE INDEX `equipment_categories_organizationId_id_key`(`organizationId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `equipment_items` (
    `id` VARCHAR(64) NOT NULL,
    `organizationId` VARCHAR(64) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(8) NOT NULL DEFAULT 'item',
    `tracking` VARCHAR(8) NOT NULL DEFAULT 'unit',
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `defectiveQty` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(12) NOT NULL DEFAULT 'available',
    `condition` VARCHAR(8) NOT NULL DEFAULT 'good',
    `categoryId` VARCHAR(64) NULL,
    `containerId` VARCHAR(64) NULL,
    `manufacturer` VARCHAR(96) NULL,
    `model` VARCHAR(96) NULL,
    `serialNumber` VARCHAR(96) NULL,
    `powerWatts` INTEGER NULL,
    `batteryPowered` BOOLEAN NOT NULL DEFAULT false,
    `specs` JSON NULL,
    `notes` TEXT NULL,
    `excludeFromSharing` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `equipment_items_organizationId_status_idx`(`organizationId`, `status`),
    INDEX `equipment_items_organizationId_categoryId_idx`(`organizationId`, `categoryId`),
    INDEX `equipment_items_organizationId_containerId_idx`(`organizationId`, `containerId`),
    UNIQUE INDEX `equipment_items_organizationId_code_key`(`organizationId`, `code`),
    UNIQUE INDEX `equipment_items_organizationId_id_key`(`organizationId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `equipment_packages` (
    `id` VARCHAR(64) NOT NULL,
    `organizationId` VARCHAR(64) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` TEXT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `equipment_packages_organizationId_name_key`(`organizationId`, `name`),
    UNIQUE INDEX `equipment_packages_organizationId_id_key`(`organizationId`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `equipment_package_lines` (
    `id` VARCHAR(64) NOT NULL,
    `organizationId` VARCHAR(64) NOT NULL,
    `packageId` VARCHAR(64) NOT NULL,
    `itemId` VARCHAR(64) NULL,
    `categoryId` VARCHAR(64) NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `position` INTEGER NOT NULL DEFAULT 0,

    INDEX `equipment_package_lines_organizationId_packageId_position_idx`(`organizationId`, `packageId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `booking_equipment` (
    `id` VARCHAR(64) NOT NULL,
    `organizationId` VARCHAR(64) NOT NULL,
    `bookingId` VARCHAR(64) NOT NULL,
    `itemId` VARCHAR(64) NOT NULL,
    `viaContainerId` VARCHAR(64) NULL,
    `quantity` INTEGER NOT NULL,
    `loadedQty` INTEGER NOT NULL DEFAULT 0,
    `returnedQty` INTEGER NOT NULL DEFAULT 0,
    `damagedQty` INTEGER NOT NULL DEFAULT 0,
    `lostQty` INTEGER NOT NULL DEFAULT 0,
    `reservedAt` DATETIME(3) NULL,
    `overrideReason` VARCHAR(191) NULL,
    `overriddenById` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `booking_equipment_organizationId_itemId_idx`(`organizationId`, `itemId`),
    UNIQUE INDEX `booking_equipment_bookingId_itemId_key`(`bookingId`, `itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `equipment_events` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `organizationId` VARCHAR(64) NOT NULL,
    `itemId` VARCHAR(64) NOT NULL,
    `bookingId` VARCHAR(64) NULL,
    `type` VARCHAR(24) NOT NULL,
    `actorId` VARCHAR(64) NULL,
    `data` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `equipment_events_organizationId_itemId_createdAt_idx`(`organizationId`, `itemId`, `createdAt`),
    INDEX `equipment_events_organizationId_bookingId_idx`(`organizationId`, `bookingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `bookings_organizationId_id_key` ON `bookings`(`organizationId`, `id`);

-- AddForeignKey
ALTER TABLE `equipment_categories` ADD CONSTRAINT `equipment_categories_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `equipment_items` ADD CONSTRAINT `equipment_items_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `equipment_items` ADD CONSTRAINT `equipment_items_organizationId_categoryId_fkey` FOREIGN KEY (`organizationId`, `categoryId`) REFERENCES `equipment_categories`(`organizationId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `equipment_items` ADD CONSTRAINT `equipment_items_organizationId_containerId_fkey` FOREIGN KEY (`organizationId`, `containerId`) REFERENCES `equipment_items`(`organizationId`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `equipment_packages` ADD CONSTRAINT `equipment_packages_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `equipment_package_lines` ADD CONSTRAINT `equipment_package_lines_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `equipment_package_lines` ADD CONSTRAINT `equipment_package_lines_organizationId_packageId_fkey` FOREIGN KEY (`organizationId`, `packageId`) REFERENCES `equipment_packages`(`organizationId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `equipment_package_lines` ADD CONSTRAINT `equipment_package_lines_organizationId_itemId_fkey` FOREIGN KEY (`organizationId`, `itemId`) REFERENCES `equipment_items`(`organizationId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `equipment_package_lines` ADD CONSTRAINT `equipment_package_lines_organizationId_categoryId_fkey` FOREIGN KEY (`organizationId`, `categoryId`) REFERENCES `equipment_categories`(`organizationId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_equipment` ADD CONSTRAINT `booking_equipment_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_equipment` ADD CONSTRAINT `booking_equipment_organizationId_bookingId_fkey` FOREIGN KEY (`organizationId`, `bookingId`) REFERENCES `bookings`(`organizationId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking_equipment` ADD CONSTRAINT `booking_equipment_organizationId_itemId_fkey` FOREIGN KEY (`organizationId`, `itemId`) REFERENCES `equipment_items`(`organizationId`, `id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `equipment_events` ADD CONSTRAINT `equipment_events_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `equipment_events` ADD CONSTRAINT `equipment_events_organizationId_itemId_fkey` FOREIGN KEY (`organizationId`, `itemId`) REFERENCES `equipment_items`(`organizationId`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Quantity rules Prisma does not model (it ignores CHECK constraints, so they cause no drift).
-- MySQL refuses CHECKs on foreign-key columns, so "a package line has an item or a category" is checked in core.
ALTER TABLE `equipment_items` ADD CONSTRAINT `equipment_items_quantities_check` CHECK (`quantity` >= 0 AND `defectiveQty` >= 0 AND `defectiveQty` <= `quantity`);
ALTER TABLE `booking_equipment` ADD CONSTRAINT `booking_equipment_quantities_check` CHECK (`quantity` >= 1 AND `loadedQty` >= 0 AND `loadedQty` <= `quantity` AND `returnedQty` >= 0 AND `damagedQty` >= 0 AND `lostQty` >= 0 AND `returnedQty` + `damagedQty` + `lostQty` <= `loadedQty`);
