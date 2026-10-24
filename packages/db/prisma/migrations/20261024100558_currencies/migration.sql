-- AlterTable
ALTER TABLE `bookings` ADD COLUMN `currency` VARCHAR(3) NOT NULL DEFAULT 'EUR';

-- AlterTable
ALTER TABLE `organizations` ADD COLUMN `currency` VARCHAR(3) NOT NULL DEFAULT 'EUR';

-- CreateTable
CREATE TABLE `exchange_rates` (
    `currency` VARCHAR(3) NOT NULL,
    `perEur` DECIMAL(18, 8) NOT NULL,
    `rateDate` DATE NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`currency`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
