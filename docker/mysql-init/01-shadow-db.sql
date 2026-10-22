-- Prisma Migrate needs a shadow database and permission to create it.
CREATE DATABASE IF NOT EXISTS stagedesk_shadow;
CREATE DATABASE IF NOT EXISTS stagedesk_test;
GRANT ALL PRIVILEGES ON *.* TO 'stagedesk'@'%';
FLUSH PRIVILEGES;
