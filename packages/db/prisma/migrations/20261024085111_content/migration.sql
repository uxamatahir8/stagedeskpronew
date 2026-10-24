-- CreateTable
CREATE TABLE `content_categories` (
    `id` VARCHAR(64) NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `slug` VARCHAR(80) NOT NULL,
    `nameNl` VARCHAR(80) NOT NULL,
    `nameEn` VARCHAR(80) NOT NULL,
    `descriptionNl` VARCHAR(300) NULL,
    `descriptionEn` VARCHAR(300) NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `content_categories_kind_slug_key`(`kind`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `content_articles` (
    `id` VARCHAR(64) NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `categoryId` VARCHAR(64) NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'draft',
    `featured` BOOLEAN NOT NULL DEFAULT false,
    `publishedAt` DATETIME(3) NULL,
    `coverImage` VARCHAR(500) NULL,
    `authorName` VARCHAR(120) NULL,
    `nl` JSON NOT NULL,
    `en` JSON NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `content_articles_kind_status_publishedAt_idx`(`kind`, `status`, `publishedAt`),
    UNIQUE INDEX `content_articles_kind_slug_key`(`kind`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `content_articles` ADD CONSTRAINT `content_articles_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `content_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
