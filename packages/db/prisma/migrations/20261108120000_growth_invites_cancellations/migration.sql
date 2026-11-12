-- CreateTable
CREATE TABLE `agency_invites` (
    `id` VARCHAR(64) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(8) NOT NULL,
    `inviterUserId` VARCHAR(64) NOT NULL,
    `inviterAgencyId` VARCHAR(64) NULL,
    `joinedAgencyId` VARCHAR(64) NULL,
    `joinedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `agency_invites_email_idx`(`email`),
    INDEX `agency_invites_inviterUserId_createdAt_idx`(`inviterUserId`, `createdAt`),
    INDEX `agency_invites_inviterAgencyId_idx`(`inviterAgencyId`),
    INDEX `agency_invites_joinedAgencyId_idx`(`joinedAgencyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cancellation_feedback` (
    `id` VARCHAR(64) NOT NULL,
    `agencyId` VARCHAR(64) NOT NULL,
    `userId` VARCHAR(64) NULL,
    `reason` VARCHAR(32) NOT NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `cancellation_feedback_agencyId_idx`(`agencyId`),
    INDEX `cancellation_feedback_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `agency_invites` ADD CONSTRAINT `agency_invites_inviterUserId_fkey` FOREIGN KEY (`inviterUserId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agency_invites` ADD CONSTRAINT `agency_invites_inviterAgencyId_fkey` FOREIGN KEY (`inviterAgencyId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `agency_invites` ADD CONSTRAINT `agency_invites_joinedAgencyId_fkey` FOREIGN KEY (`joinedAgencyId`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cancellation_feedback` ADD CONSTRAINT `cancellation_feedback_agencyId_fkey` FOREIGN KEY (`agencyId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

