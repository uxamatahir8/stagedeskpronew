-- Bookings a platform admin created were stored as source 'platform'; the name is now 'platform_admin'.
UPDATE `bookings` SET `source` = 'platform_admin' WHERE `source` = 'platform';
