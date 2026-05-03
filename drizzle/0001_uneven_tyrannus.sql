CREATE TABLE `apiKeys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`hashedKey` varchar(255) NOT NULL,
	`keyPrefix` varchar(20) NOT NULL,
	`name` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp,
	`revokedAt` timestamp,
	CONSTRAINT `apiKeys_id` PRIMARY KEY(`id`),
	CONSTRAINT `apiKeys_hashedKey_unique` UNIQUE(`hashedKey`)
);
--> statement-breakpoint
CREATE TABLE `chunks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`documentId` int NOT NULL,
	`sequenceIndex` int NOT NULL,
	`text` text NOT NULL,
	`pageNo` int,
	`embeddingJson` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `chunks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`versionId` int NOT NULL,
	`filename` varchar(255) NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`fileSize` int NOT NULL,
	`fileType` varchar(50) NOT NULL,
	`contentSummary` text,
	`chunkCount` int NOT NULL DEFAULT 0,
	`ingestionStatus` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`ingestionError` text,
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pipelineVersions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pipelineId` int NOT NULL,
	`versionNumber` int NOT NULL,
	`config` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pipelineVersions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pipelines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`currentVersionId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pipelines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `usageLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pipelineId` int NOT NULL,
	`projectId` int NOT NULL,
	`eventType` enum('query','document_upload','embedding_generated') NOT NULL,
	`tokensUsed` int DEFAULT 0,
	`responseTimeMs` int,
	`status` enum('success','error') NOT NULL DEFAULT 'success',
	`errorMessage` text,
	`timestamp` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `usageLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `apiKeys_projectId_idx` ON `apiKeys` (`projectId`);--> statement-breakpoint
CREATE INDEX `chunks_documentId_idx` ON `chunks` (`documentId`);--> statement-breakpoint
CREATE INDEX `documents_versionId_idx` ON `documents` (`versionId`);--> statement-breakpoint
CREATE INDEX `pipelineVersions_pipelineId_idx` ON `pipelineVersions` (`pipelineId`);--> statement-breakpoint
CREATE INDEX `pipelines_projectId_idx` ON `pipelines` (`projectId`);--> statement-breakpoint
CREATE INDEX `projects_userId_idx` ON `projects` (`userId`);--> statement-breakpoint
CREATE INDEX `usageLogs_pipelineId_idx` ON `usageLogs` (`pipelineId`);--> statement-breakpoint
CREATE INDEX `usageLogs_projectId_idx` ON `usageLogs` (`projectId`);--> statement-breakpoint
CREATE INDEX `usageLogs_timestamp_idx` ON `usageLogs` (`timestamp`);