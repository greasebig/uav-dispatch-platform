CREATE TABLE `customerProfiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`companyName` text,
	`companyLicense` text,
	`businessScope` text,
	`contactPerson` varchar(100),
	`contactPhone` varchar(20),
	`address` text,
	`latitude` decimal(10,8),
	`longitude` decimal(11,8),
	`isVerified` boolean DEFAULT false,
	`verifiedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customerProfiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `customerProfiles_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` enum('task_assigned','task_accepted','task_completed','task_cancelled','payment_received','settlement_processed','qualification_approved','qualification_rejected','rating_received','system_alert') NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` longtext,
	`relatedTaskId` int,
	`relatedOrderId` int,
	`isRead` boolean DEFAULT false,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`customerId` int NOT NULL,
	`pilotId` int,
	`orderNumber` varchar(50) NOT NULL,
	`taskAmount` decimal(10,2) NOT NULL,
	`platformFee` decimal(10,2) DEFAULT '0.00',
	`totalAmount` decimal(10,2) NOT NULL,
	`status` enum('pending','paid','refunded','disputed') DEFAULT 'pending',
	`paymentMethod` enum('stripe','bank_transfer'),
	`stripePaymentIntentId` varchar(100),
	`paidAt` timestamp,
	`refundAmount` decimal(10,2) DEFAULT '0.00',
	`refundReason` text,
	`refundedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_taskId_unique` UNIQUE(`taskId`),
	CONSTRAINT `orders_orderNumber_unique` UNIQUE(`orderNumber`)
);
--> statement-breakpoint
CREATE TABLE `pilotEquipment` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pilotId` int NOT NULL,
	`droneModel` varchar(100) NOT NULL,
	`droneSerialNumber` varchar(100) NOT NULL,
	`dronePhoto` text,
	`maxPayload` decimal(8,2),
	`maxFlightTime` int,
	`maxDistance` int,
	`supportedServices` varchar(255),
	`registrationNumber` varchar(50),
	`insuranceExpiry` datetime,
	`status` enum('active','maintenance','inactive') DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pilotEquipment_id` PRIMARY KEY(`id`),
	CONSTRAINT `pilotEquipment_droneSerialNumber_unique` UNIQUE(`droneSerialNumber`)
);
--> statement-breakpoint
CREATE TABLE `pilotProfiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`realName` varchar(100) NOT NULL,
	`idNumber` varchar(50) NOT NULL,
	`idPhotoFront` text,
	`idPhotoBack` text,
	`isRealNameVerified` boolean DEFAULT false,
	`realNameVerifiedAt` timestamp,
	`serviceRadius` int DEFAULT 50,
	`baseLatitude` decimal(10,8),
	`baseLongitude` decimal(11,8),
	`level` enum('junior','intermediate','senior','vip') DEFAULT 'junior',
	`totalScore` decimal(5,2) DEFAULT '0.00',
	`totalTasks` int DEFAULT 0,
	`completedTasks` int DEFAULT 0,
	`fulfillmentRate` decimal(5,2) DEFAULT '0.00',
	`averageRating` decimal(3,2) DEFAULT '0.00',
	`totalComplaints` int DEFAULT 0,
	`status` enum('available','busy','offline','blocked') DEFAULT 'offline',
	`currentLoad` int DEFAULT 0,
	`maxConcurrentTasks` int DEFAULT 3,
	`bankAccount` varchar(50),
	`bankName` varchar(100),
	`accountHolder` varchar(100),
	`depositAmount` decimal(10,2) DEFAULT '0.00',
	`depositFrozen` decimal(10,2) DEFAULT '0.00',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pilotProfiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `pilotProfiles_userId_unique` UNIQUE(`userId`),
	CONSTRAINT `pilotProfiles_idNumber_unique` UNIQUE(`idNumber`)
);
--> statement-breakpoint
CREATE TABLE `pilotQualifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pilotId` int NOT NULL,
	`type` enum('drone_license','operation_cert','safety_cert','insurance') NOT NULL,
	`certificateNumber` varchar(100) NOT NULL,
	`issueDate` datetime,
	`expiryDate` datetime,
	`documentUrl` text,
	`status` enum('pending','approved','rejected','expired') DEFAULT 'pending',
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`rejectionReason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pilotQualifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pilotSettlements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pilotId` int NOT NULL,
	`settlementNumber` varchar(50) NOT NULL,
	`settlementPeriodStart` datetime NOT NULL,
	`settlementPeriodEnd` datetime NOT NULL,
	`totalEarnings` decimal(10,2) DEFAULT '0.00',
	`platformCommission` decimal(10,2) DEFAULT '0.00',
	`depositDeduction` decimal(10,2) DEFAULT '0.00',
	`netAmount` decimal(10,2) DEFAULT '0.00',
	`status` enum('pending','processing','completed','failed') DEFAULT 'pending',
	`stripePayoutId` varchar(100),
	`processedAt` timestamp,
	`failureReason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pilotSettlements_id` PRIMARY KEY(`id`),
	CONSTRAINT `pilotSettlements_settlementNumber_unique` UNIQUE(`settlementNumber`)
);
--> statement-breakpoint
CREATE TABLE `riskControls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`riskType` enum('fraud','safety_violation','quality_issue','payment_default','complaint') NOT NULL,
	`severity` enum('low','medium','high','critical') DEFAULT 'medium',
	`description` longtext,
	`evidence` longtext,
	`status` enum('active','resolved','appealed') DEFAULT 'active',
	`action` enum('warning','suspension','blacklist') DEFAULT 'warning',
	`actionDuration` int,
	`appealedAt` timestamp,
	`appealReason` text,
	`resolvedAt` timestamp,
	`resolvedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `riskControls_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `systemConfig` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(100) NOT NULL,
	`value` longtext,
	`description` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `systemConfig_id` PRIMARY KEY(`id`),
	CONSTRAINT `systemConfig_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `taskExecutionData` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`pilotId` int NOT NULL,
	`flightLogUrl` text,
	`flightDuration` int,
	`actualArea` decimal(10,2),
	`actualDistance` decimal(10,2),
	`flightPath` longtext,
	`photoUrls` longtext,
	`photoCount` int DEFAULT 0,
	`arrivalTime` timestamp,
	`departureTime` timestamp,
	`completionTime` timestamp,
	`notes` longtext,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `taskExecutionData_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `taskPushHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`pilotId` int NOT NULL,
	`batchNumber` int NOT NULL,
	`pushTime` timestamp NOT NULL DEFAULT (now()),
	`status` enum('pending','accepted','rejected','expired') DEFAULT 'pending',
	`responseTime` timestamp,
	`responseType` enum('accept','reject'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `taskPushHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `taskRatings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`customerId` int NOT NULL,
	`pilotId` int NOT NULL,
	`rating` int NOT NULL,
	`comment` longtext,
	`qualityScore` int,
	`timelinessScore` int,
	`communicationScore` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `taskRatings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`taskType` enum('spray','transport') NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` longtext,
	`location` varchar(255) NOT NULL,
	`latitude` decimal(10,8) NOT NULL,
	`longitude` decimal(11,8) NOT NULL,
	`area` decimal(10,2),
	`weight` decimal(10,2),
	`estimatedDuration` int,
	`requiredEquipment` varchar(255),
	`specialRequirements` text,
	`scheduledDate` datetime NOT NULL,
	`scheduledEndDate` datetime,
	`timeWindow` varchar(100),
	`budgetAmount` decimal(10,2) NOT NULL,
	`platformFeeRate` decimal(5,2) DEFAULT '10.00',
	`status` enum('draft','published','pending_approval','approved','pushing','accepted','in_progress','completed','cancelled','disputed') NOT NULL DEFAULT 'draft',
	`assignedPilotId` int,
	`assignmentTime` timestamp,
	`currentBatchNumber` int DEFAULT 0,
	`lastPushTime` timestamp,
	`completedAt` timestamp,
	`cancelledAt` timestamp,
	`cancellationReason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('customer','pilot','admin') NOT NULL DEFAULT 'customer';--> statement-breakpoint
ALTER TABLE `users` ADD `phone` varchar(20);--> statement-breakpoint
ALTER TABLE `users` ADD `avatar` text;