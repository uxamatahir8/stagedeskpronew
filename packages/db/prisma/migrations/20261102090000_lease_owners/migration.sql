-- Lease owners (fencing tokens) for financial operations, Stripe events and affiliate Stripe withdrawals,
-- and the seat-check mark on invitations. Additive.
-- AlterTable
ALTER TABLE `invitations` ADD COLUMN `seatCheckedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `financial_operations` ADD COLUMN `lockToken` VARCHAR(64) NULL;

-- AlterTable
ALTER TABLE `stripe_events` ADD COLUMN `lockToken` VARCHAR(64) NULL;

-- AlterTable
ALTER TABLE `affiliate_payouts` ADD COLUMN `attempts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `lockToken` VARCHAR(64) NULL,
    ADD COLUMN `lockedUntil` DATETIME(3) NULL;


-- Pending invitations already hold their seat: mark them checked so a resend doesn't re-check them.
UPDATE `invitations` SET `seatCheckedAt` = `createdAt` WHERE `status` = 'pending';
