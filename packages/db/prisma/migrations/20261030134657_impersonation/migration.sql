-- AlterTable
ALTER TABLE `audit_events` ADD COLUMN `impersonatorId` VARCHAR(64) NULL;

-- AlterTable
ALTER TABLE `sessions` ADD COLUMN `impersonatedBy` VARCHAR(64) NULL;
