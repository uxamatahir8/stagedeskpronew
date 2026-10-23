-- AlterTable
ALTER TABLE `organizations` ADD COLUMN `acceptBankTransfer` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `acceptCash` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `acceptOnline` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `bankAccountName` VARCHAR(191) NULL,
    ADD COLUMN `iban` VARCHAR(34) NULL,
    ADD COLUMN `paymentInstructions` TEXT NULL;
