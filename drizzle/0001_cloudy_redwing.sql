CREATE TABLE `callRecordings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`callSid` varchar(64),
	`direction` enum('inbound','outbound') NOT NULL,
	`fromNumber` varchar(32),
	`toNumber` varchar(32),
	`duration` int,
	`recordingUrl` text,
	`recordingKey` varchar(255),
	`transcription` text,
	`summary` text,
	`status` enum('processing','ready','failed','deleted') NOT NULL DEFAULT 'processing',
	`retentionDays` int DEFAULT 90,
	`expiresAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `callRecordings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `callRoutes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`priority` int DEFAULT 0,
	`matchType` enum('all','caller_id','time_based','did') NOT NULL DEFAULT 'all',
	`matchPattern` varchar(128),
	`timeStart` varchar(8),
	`timeEnd` varchar(8),
	`daysOfWeek` json,
	`destinationType` enum('endpoint','ring_group','external','voicemail','ai_agent') NOT NULL DEFAULT 'endpoint',
	`destinationId` int,
	`destinationExternal` varchar(128),
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `callRoutes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`companyName` varchar(255),
	`email` varchar(320) NOT NULL,
	`phone` varchar(32),
	`status` enum('active','suspended','pending','cancelled') NOT NULL DEFAULT 'pending',
	`signalwireSubprojectSid` varchar(64),
	`signalwireApiToken` text,
	`signalwireSpaceUrl` varchar(255),
	`brandingLogo` text,
	`brandingPrimaryColor` varchar(7) DEFAULT '#6366f1',
	`brandingCompanyName` varchar(255),
	`portalUsername` varchar(64),
	`portalPasswordHash` text,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customers_id` PRIMARY KEY(`id`),
	CONSTRAINT `customers_portalUsername_unique` UNIQUE(`portalUsername`)
);
--> statement-breakpoint
CREATE TABLE `llmCallFlows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`naturalLanguageConfig` text,
	`generatedLaml` text,
	`isActive` boolean DEFAULT false,
	`lastGeneratedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `llmCallFlows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notificationSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`missedCallEmail` boolean DEFAULT true,
	`missedCallInApp` boolean DEFAULT true,
	`voicemailEmail` boolean DEFAULT true,
	`voicemailInApp` boolean DEFAULT true,
	`highVolumeEmail` boolean DEFAULT false,
	`highVolumeInApp` boolean DEFAULT true,
	`highVolumeThreshold` int DEFAULT 100,
	`recordingReadyEmail` boolean DEFAULT false,
	`recordingReadyInApp` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notificationSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `notificationSettings_customerId_unique` UNIQUE(`customerId`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`userId` int,
	`type` enum('missed_call','voicemail','high_volume','system','recording_ready') NOT NULL,
	`title` varchar(255) NOT NULL,
	`message` text,
	`metadata` json,
	`isRead` boolean DEFAULT false,
	`emailSent` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `phoneNumbers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`signalwirePhoneNumberSid` varchar(64),
	`phoneNumber` varchar(32) NOT NULL,
	`friendlyName` varchar(128),
	`voiceEnabled` boolean DEFAULT true,
	`smsEnabled` boolean DEFAULT false,
	`faxEnabled` boolean DEFAULT false,
	`assignedToEndpointId` int,
	`assignedToRingGroupId` int,
	`callHandler` enum('laml_webhooks','relay_context','relay_topic','ai_agent','sip_endpoint','ring_group') DEFAULT 'laml_webhooks',
	`callRequestUrl` text,
	`callRelayContext` varchar(64),
	`status` enum('active','inactive','porting') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `phoneNumbers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `retentionPolicies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`defaultRetentionDays` int DEFAULT 90,
	`autoDeleteEnabled` boolean DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `retentionPolicies_id` PRIMARY KEY(`id`),
	CONSTRAINT `retentionPolicies_customerId_unique` UNIQUE(`customerId`)
);
--> statement-breakpoint
CREATE TABLE `ringGroups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`extensionNumber` varchar(16),
	`strategy` enum('simultaneous','sequential','round_robin','random') NOT NULL DEFAULT 'simultaneous',
	`ringTimeout` int DEFAULT 30,
	`memberEndpointIds` json,
	`failoverAction` enum('voicemail','forward','hangup') DEFAULT 'voicemail',
	`failoverDestination` varchar(128),
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ringGroups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sipEndpoints` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`signalwireEndpointId` varchar(64),
	`username` varchar(64) NOT NULL,
	`password` text,
	`callerId` varchar(64),
	`sendAs` varchar(32),
	`displayName` varchar(128),
	`extensionNumber` varchar(16),
	`status` enum('active','inactive','provisioning') NOT NULL DEFAULT 'provisioning',
	`callHandler` enum('laml_webhooks','relay_context','relay_topic','ai_agent','video_room') DEFAULT 'laml_webhooks',
	`callRequestUrl` text,
	`callRequestMethod` enum('GET','POST') DEFAULT 'POST',
	`callRelayContext` varchar(64),
	`callAiAgentId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sipEndpoints_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `usageStats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`periodStart` timestamp NOT NULL,
	`periodEnd` timestamp NOT NULL,
	`totalCalls` int DEFAULT 0,
	`inboundCalls` int DEFAULT 0,
	`outboundCalls` int DEFAULT 0,
	`totalMinutes` int DEFAULT 0,
	`missedCalls` int DEFAULT 0,
	`activeEndpoints` int DEFAULT 0,
	`activePhoneNumbers` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `usageStats_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `customerId` int;