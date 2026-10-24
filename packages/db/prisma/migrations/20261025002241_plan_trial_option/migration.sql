-- AlterTable
ALTER TABLE `organizations` ADD COLUMN `trialUsedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `plans` ADD COLUMN `trialEnabled` BOOLEAN NOT NULL DEFAULT false;

-- Agencies that already had a trial do not get another one.
UPDATE `organizations` o JOIN `subscriptions` s ON s.organizationId = o.id SET o.trialUsedAt = COALESCE(s.createdAt, NOW(3)) WHERE s.trialEndsAt IS NOT NULL;
