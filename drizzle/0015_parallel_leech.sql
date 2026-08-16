ALTER TABLE `concerns` ADD `row_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `conversation_threads` ADD `row_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `engagements` ADD `row_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `procedures` ADD `row_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `row_version` integer DEFAULT 1 NOT NULL;