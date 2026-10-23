-- AlterTable
ALTER TABLE `organizations` ADD COLUMN `adminNotes` TEXT NULL,
    ADD COLUMN `suspendReason` VARCHAR(191) NULL,
    ADD COLUMN `suspendedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `subscriptions` ADD COLUMN `complimentary` BOOLEAN NOT NULL DEFAULT false;
