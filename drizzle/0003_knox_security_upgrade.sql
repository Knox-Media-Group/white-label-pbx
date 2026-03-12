-- Knox Command Center Security Upgrade Migration
-- Run with: mysql -u root -p knox_pbx < drizzle/0003_knox_security_upgrade.sql

-- 1. Expand user roles (backward-compatible: old "user" rows stay valid)
ALTER TABLE `users`
  MODIFY COLUMN `role` ENUM('user','viewer','operator','admin') NOT NULL DEFAULT 'viewer';

-- 2. Add session version for forced logout / session invalidation
ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `sessionVersion` INT NOT NULL DEFAULT 0 AFTER `customerId`;

-- 3. Migrate legacy "user" rows to "viewer"
UPDATE `users` SET `role` = 'viewer' WHERE `role` = 'user';

-- 4. Audit Logs (append-only)
CREATE TABLE IF NOT EXISTS `auditLogs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `userId` INT,
  `userEmail` VARCHAR(320),
  `userRole` VARCHAR(32),
  `action` VARCHAR(128) NOT NULL,
  `resource` VARCHAR(128) NOT NULL,
  `resourceId` VARCHAR(64),
  `detail` JSON,
  `ipAddress` VARCHAR(45),
  `userAgent` TEXT,
  `outcome` ENUM('success','denied','error') NOT NULL DEFAULT 'success',
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_audit_user` (`userId`),
  INDEX `idx_audit_action` (`action`),
  INDEX `idx_audit_created` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Metrics History
CREATE TABLE IF NOT EXISTS `metricsHistory` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `metricName` VARCHAR(128) NOT NULL,
  `metricValue` INT NOT NULL,
  `customerId` INT,
  `tags` JSON,
  `collectedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_metric_name` (`metricName`),
  INDEX `idx_metric_customer` (`customerId`),
  INDEX `idx_metric_collected` (`collectedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Alert Rules
CREATE TABLE IF NOT EXISTS `alertRules` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(128) NOT NULL,
  `metricName` VARCHAR(128) NOT NULL,
  `operator` ENUM('gt','lt','gte','lte','eq') NOT NULL,
  `threshold` INT NOT NULL,
  `customerId` INT,
  `enabled` BOOLEAN NOT NULL DEFAULT TRUE,
  `lastTriggeredAt` TIMESTAMP NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. Alert Events
CREATE TABLE IF NOT EXISTS `alertEvents` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `alertRuleId` INT NOT NULL,
  `metricValue` INT NOT NULL,
  `message` TEXT,
  `acknowledged` BOOLEAN DEFAULT FALSE,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_alert_rule` (`alertRuleId`),
  INDEX `idx_alert_created` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
