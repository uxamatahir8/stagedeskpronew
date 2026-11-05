-- Blog contributors and moderation metadata.
ALTER TABLE `content_articles`
  ADD COLUMN `authorId` VARCHAR(64) NULL,
  ADD COLUMN `submittedAt` DATETIME(3) NULL,
  ADD COLUMN `reviewedById` VARCHAR(64) NULL,
  ADD COLUMN `reviewedAt` DATETIME(3) NULL,
  ADD COLUMN `rejectionReason` VARCHAR(500) NULL;

CREATE INDEX `content_articles_authorId_kind_status_idx`
  ON `content_articles`(`authorId`, `kind`, `status`);

ALTER TABLE `content_articles`
  ADD CONSTRAINT `content_articles_authorId_fkey`
    FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `content_articles_reviewedById_fkey`
    FOREIGN KEY (`reviewedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Platform booking types have organizationId NULL. Custom types belong to an
-- agency/solo business. The service layer guards global-key uniqueness because
-- MySQL permits multiple NULL values in a composite unique key.
CREATE TABLE `booking_types` (
  `id` VARCHAR(64) NOT NULL,
  `key` VARCHAR(64) NOT NULL,
  `nameNl` VARCHAR(80) NOT NULL,
  `nameEn` VARCHAR(80) NOT NULL,
  `organizationId` VARCHAR(64) NULL,
  `createdById` VARCHAR(64) NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `protected` BOOLEAN NOT NULL DEFAULT false,
  `position` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `booking_types_organizationId_key_key`(`organizationId`, `key`),
  INDEX `booking_types_organizationId_active_position_idx`(`organizationId`, `active`, `position`),
  INDEX `booking_types_createdById_idx`(`createdById`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `booking_types`
  ADD CONSTRAINT `booking_types_organizationId_fkey`
    FOREIGN KEY (`organizationId`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `booking_types_createdById_fkey`
    FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO `booking_types`
  (`id`, `key`, `nameNl`, `nameEn`, `organizationId`, `createdById`, `active`, `protected`, `position`, `createdAt`, `updatedAt`)
VALUES
  ('system-booking-type-wedding', 'wedding', 'Bruiloft', 'Wedding', NULL, NULL, true, true, 0, NOW(3), NOW(3)),
  ('system-booking-type-corporate', 'corporate', 'Bedrijfsfeest', 'Corporate event', NULL, NULL, true, false, 1, NOW(3), NOW(3)),
  ('system-booking-type-birthday', 'birthday', 'Verjaardag', 'Birthday', NULL, NULL, true, false, 2, NOW(3), NOW(3)),
  ('system-booking-type-party', 'party', 'Feest', 'Party', NULL, NULL, true, false, 3, NOW(3), NOW(3)),
  ('system-booking-type-festival', 'festival', 'Festival', 'Festival', NULL, NULL, true, false, 4, NOW(3), NOW(3)),
  ('system-booking-type-other', 'other', 'Anders', 'Other', NULL, NULL, true, false, 5, NOW(3), NOW(3));
