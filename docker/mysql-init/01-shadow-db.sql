-- Prisma Migrate needs a shadow database and permission to create it.
CREATE DATABASE IF NOT EXISTS stagedesk_shadow;
GRANT ALL PRIVILEGES ON *.* TO 'stagedesk'@'%';
FLUSH PRIVILEGES;
