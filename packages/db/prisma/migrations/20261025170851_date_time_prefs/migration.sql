-- AlterTable
ALTER TABLE `organizations` ADD COLUMN `dateFormat` VARCHAR(16) NULL,
    ADD COLUMN `timeFormat` VARCHAR(4) NULL,
    ADD COLUMN `timeZone` VARCHAR(64) NULL;

-- AlterTable
ALTER TABLE `users` ADD COLUMN `dateFormat` VARCHAR(16) NULL,
    ADD COLUMN `timeFormat` VARCHAR(4) NULL,
    ADD COLUMN `timeZone` VARCHAR(64) NULL;
