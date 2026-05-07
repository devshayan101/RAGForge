ALTER TABLE `apiKeys` ADD PRIMARY KEY(`id`);--> statement-breakpoint
ALTER TABLE `chunks` ADD PRIMARY KEY(`id`);--> statement-breakpoint
ALTER TABLE `documents` ADD PRIMARY KEY(`id`);--> statement-breakpoint
ALTER TABLE `pipelineVersions` ADD PRIMARY KEY(`id`);--> statement-breakpoint
ALTER TABLE `pipelines` ADD PRIMARY KEY(`id`);--> statement-breakpoint
ALTER TABLE `projects` ADD PRIMARY KEY(`id`);--> statement-breakpoint
ALTER TABLE `usageLogs` ADD PRIMARY KEY(`id`);--> statement-breakpoint
ALTER TABLE `users` ADD PRIMARY KEY(`id`);