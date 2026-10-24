-- CreateTable
CREATE TABLE `user_guides` (
    `userId` VARCHAR(64) NOT NULL,
    `stepId` VARCHAR(64) NOT NULL,
    `seenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`userId`, `stepId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
