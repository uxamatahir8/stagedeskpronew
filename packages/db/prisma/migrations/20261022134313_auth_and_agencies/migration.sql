-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `emailVerified` BOOLEAN NOT NULL DEFAULT false,
    `image` TEXT NULL,
    `twoFactorEnabled` BOOLEAN NULL DEFAULT false,
    `platformRole` VARCHAR(32) NULL,
    `locale` VARCHAR(8) NULL DEFAULT 'nl',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `id` VARCHAR(64) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `ipAddress` VARCHAR(64) NULL,
    `userAgent` TEXT NULL,
    `userId` VARCHAR(64) NOT NULL,
    `activeOrganizationId` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sessions_token_key`(`token`),
    INDEX `sessions_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `accounts` (
    `id` VARCHAR(64) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `providerId` VARCHAR(64) NOT NULL,
    `userId` VARCHAR(64) NOT NULL,
    `accessToken` TEXT NULL,
    `refreshToken` TEXT NULL,
    `idToken` TEXT NULL,
    `accessTokenExpiresAt` DATETIME(3) NULL,
    `refreshTokenExpiresAt` DATETIME(3) NULL,
    `scope` TEXT NULL,
    `password` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `accounts_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `verifications` (
    `id` VARCHAR(64) NOT NULL,
    `identifier` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `verifications_identifier_idx`(`identifier`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organizations` (
    `id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `logo` TEXT NULL,
    `metadata` TEXT NULL,
    `kvkNumber` VARCHAR(16) NULL,
    `vatNumber` VARCHAR(20) NULL,
    `contactEmail` VARCHAR(191) NULL,
    `phone` VARCHAR(32) NULL,
    `website` VARCHAR(191) NULL,
    `addressLine` VARCHAR(191) NULL,
    `postalCode` VARCHAR(16) NULL,
    `city` VARCHAR(96) NULL,
    `brandColor` VARCHAR(16) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `organizations_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `members` (
    `id` VARCHAR(64) NOT NULL,
    `organizationId` VARCHAR(64) NOT NULL,
    `userId` VARCHAR(64) NOT NULL,
    `role` VARCHAR(32) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `members_organizationId_role_idx`(`organizationId`, `role`),
    INDEX `members_userId_idx`(`userId`),
    UNIQUE INDEX `members_organizationId_userId_key`(`organizationId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invitations` (
    `id` VARCHAR(64) NOT NULL,
    `organizationId` VARCHAR(64) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `role` VARCHAR(32) NULL,
    `status` VARCHAR(16) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `inviterId` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `invitations_organizationId_status_idx`(`organizationId`, `status`),
    INDEX `invitations_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `two_factors` (
    `id` VARCHAR(64) NOT NULL,
    `secret` TEXT NOT NULL,
    `backupCodes` TEXT NOT NULL,
    `userId` VARCHAR(64) NOT NULL,
    `verified` BOOLEAN NULL DEFAULT true,
    `failedVerificationCount` INTEGER NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,

    INDEX `two_factors_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rate_limits` (
    `id` VARCHAR(64) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `count` INTEGER NOT NULL,
    `lastRequest` BIGINT NOT NULL,

    UNIQUE INDEX `rate_limits_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `members` ADD CONSTRAINT `members_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `members` ADD CONSTRAINT `members_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_organizationId_fkey` FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_inviterId_fkey` FOREIGN KEY (`inviterId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `two_factors` ADD CONSTRAINT `two_factors_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
