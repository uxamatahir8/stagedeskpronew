-- AlterTable
ALTER TABLE `leads` MODIFY `locale` VARCHAR(8) NOT NULL DEFAULT 'en';

-- AlterTable
ALTER TABLE `newsletter_subscribers` MODIFY `locale` VARCHAR(5) NOT NULL DEFAULT 'en';

-- AlterTable
ALTER TABLE `users` MODIFY `locale` VARCHAR(8) NULL DEFAULT 'en';

-- English is now the platform default language.
UPDATE `platform_settings` SET `value` = JSON_SET(`value`, "$.defaultLocale", "en") WHERE `key` = "site.general";
