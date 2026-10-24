-- CreateTable
CREATE TABLE `footer_columns` (
    `id` VARCHAR(32) NOT NULL,
    `titleNl` VARCHAR(80) NOT NULL,
    `titleEn` VARCHAR(80) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `footer_links` (
    `id` VARCHAR(64) NOT NULL,
    `columnId` VARCHAR(32) NOT NULL,
    `kind` VARCHAR(8) NOT NULL,
    `target` VARCHAR(500) NOT NULL,
    `labelNl` VARCHAR(120) NOT NULL,
    `labelEn` VARCHAR(120) NOT NULL,
    `newTab` BOOLEAN NOT NULL DEFAULT false,
    `position` INTEGER NOT NULL DEFAULT 0,

    INDEX `footer_links_columnId_position_idx`(`columnId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `footer_links` ADD CONSTRAINT `footer_links_columnId_fkey` FOREIGN KEY (`columnId`) REFERENCES `footer_columns`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
