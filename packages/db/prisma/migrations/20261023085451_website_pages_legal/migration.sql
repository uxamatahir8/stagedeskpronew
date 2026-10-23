-- CreateTable
CREATE TABLE `pages` (
    `id` VARCHAR(64) NOT NULL,
    `slugNl` VARCHAR(96) NOT NULL,
    `slugEn` VARCHAR(96) NOT NULL,
    `kind` VARCHAR(16) NOT NULL DEFAULT 'standard',
    `legalKey` VARCHAR(16) NULL,
    `acceptance` VARCHAR(16) NOT NULL DEFAULT 'none',
    `placement` VARCHAR(24) NOT NULL DEFAULT 'none',
    `position` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(16) NOT NULL DEFAULT 'draft',
    `publishedVersionId` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `pages_slugNl_key`(`slugNl`),
    UNIQUE INDEX `pages_slugEn_key`(`slugEn`),
    UNIQUE INDEX `pages_legalKey_key`(`legalKey`),
    UNIQUE INDEX `pages_publishedVersionId_key`(`publishedVersionId`),
    INDEX `pages_placement_position_idx`(`placement`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `page_versions` (
    `id` VARCHAR(64) NOT NULL,
    `pageId` VARCHAR(64) NOT NULL,
    `number` INTEGER NOT NULL,
    `content` JSON NOT NULL,
    `note` VARCHAR(191) NULL,
    `createdById` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `publishedAt` DATETIME(3) NULL,

    UNIQUE INDEX `page_versions_pageId_number_key`(`pageId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `legal_acceptances` (
    `id` VARCHAR(64) NOT NULL,
    `userId` VARCHAR(64) NOT NULL,
    `pageId` VARCHAR(64) NOT NULL,
    `versionId` VARCHAR(64) NOT NULL,
    `acceptedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ip` VARCHAR(64) NULL,

    INDEX `legal_acceptances_pageId_idx`(`pageId`),
    UNIQUE INDEX `legal_acceptances_userId_versionId_key`(`userId`, `versionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `blog_comments` (
    `id` VARCHAR(64) NOT NULL,
    `postSlug` VARCHAR(120) NOT NULL,
    `locale` VARCHAR(8) NOT NULL,
    `authorName` VARCHAR(120) NOT NULL,
    `authorEmail` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(64) NULL,
    `body` TEXT NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `blog_comments_postSlug_locale_status_idx`(`postSlug`, `locale`, `status`),
    INDEX `blog_comments_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `waitlist_entries` (
    `id` VARCHAR(64) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NULL,
    `role` VARCHAR(16) NOT NULL DEFAULT 'agency',
    `company` VARCHAR(191) NULL,
    `locale` VARCHAR(8) NOT NULL,
    `source` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `waitlist_entries_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `pages` ADD CONSTRAINT `pages_publishedVersionId_fkey` FOREIGN KEY (`publishedVersionId`) REFERENCES `page_versions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `page_versions` ADD CONSTRAINT `page_versions_pageId_fkey` FOREIGN KEY (`pageId`) REFERENCES `pages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `legal_acceptances` ADD CONSTRAINT `legal_acceptances_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `legal_acceptances` ADD CONSTRAINT `legal_acceptances_pageId_fkey` FOREIGN KEY (`pageId`) REFERENCES `pages`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `legal_acceptances` ADD CONSTRAINT `legal_acceptances_versionId_fkey` FOREIGN KEY (`versionId`) REFERENCES `page_versions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
