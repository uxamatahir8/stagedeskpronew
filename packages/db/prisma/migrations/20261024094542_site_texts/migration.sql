-- CreateTable
CREATE TABLE `site_texts` (
    `locale` VARCHAR(2) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `updatedBy` VARCHAR(64) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`locale`, `key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
