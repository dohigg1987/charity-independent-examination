CREATE TABLE `concern_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`concern_id` integer NOT NULL,
	`engagement_id` integer NOT NULL,
	`event_type` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`actor_email` text NOT NULL,
	`actor_name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`concern_id`) REFERENCES `concerns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `concern_events_concern_id_idx` ON `concern_events` (`concern_id`);--> statement-breakpoint
CREATE INDEX `concern_events_engagement_id_idx` ON `concern_events` (`engagement_id`);--> statement-breakpoint
CREATE TABLE `practice_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`concern_review_mode` text DEFAULT 'EXAMINER_JUDGEMENT' NOT NULL,
	`require_independent_concern_closure` integer DEFAULT false NOT NULL,
	`allow_procedure_self_review` integer DEFAULT false NOT NULL,
	`default_quality_review_mode` text DEFAULT 'NONE' NOT NULL,
	`file_lock_deadline_days` integer DEFAULT 60 NOT NULL,
	`retention_years` integer DEFAULT 7 NOT NULL,
	`updated_by` text DEFAULT 'system' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `concerns` ADD `reference` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `concerns` ADD `source_type` text DEFAULT 'MANUAL' NOT NULL;--> statement-breakpoint
ALTER TABLE `concerns` ADD `category` text DEFAULT 'GENERAL' NOT NULL;--> statement-breakpoint
ALTER TABLE `concerns` ADD `management_response` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `concerns` ADD `examiner_conclusion` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `concerns` ADD `reporting_assessment` text DEFAULT 'UNDETERMINED' NOT NULL;--> statement-breakpoint
ALTER TABLE `concerns` ADD `submitted_by` text;--> statement-breakpoint
ALTER TABLE `concerns` ADD `submitted_at` text;--> statement-breakpoint
ALTER TABLE `concerns` ADD `reviewed_by` text;--> statement-breakpoint
ALTER TABLE `concerns` ADD `reviewed_at` text;--> statement-breakpoint
ALTER TABLE `concerns` ADD `review_conclusion` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `concerns` ADD `closure_hash` text;--> statement-breakpoint
ALTER TABLE `concerns` ADD `reopened_by` text;--> statement-breakpoint
ALTER TABLE `concerns` ADD `reopened_at` text;--> statement-breakpoint
ALTER TABLE `concerns` ADD `reopen_reason` text;--> statement-breakpoint
ALTER TABLE `concerns` ADD `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
UPDATE `concerns` SET `reference`='FND-' || `engagement_id` || '-' || printf('%03d', `id`), `source_type`=CASE WHEN `procedure_id` IS NOT NULL THEN 'PROCEDURE' ELSE 'MANUAL' END, `examiner_conclusion`=CASE WHEN `status`='RESOLVED' THEN `resolution` ELSE '' END, `reporting_assessment`=CASE WHEN `status`='RESOLVED' THEN 'NO_REPORTING_EFFECT' ELSE 'UNDETERMINED' END, `reviewed_by`=CASE WHEN `status`='RESOLVED' THEN `resolved_by` ELSE NULL END, `reviewed_at`=CASE WHEN `status`='RESOLVED' THEN `resolved_at` ELSE NULL END, `review_conclusion`=CASE WHEN `status`='RESOLVED' THEN `resolution` ELSE '' END, `updated_at`=COALESCE(`resolved_at`,`created_at`,CURRENT_TIMESTAMP);--> statement-breakpoint
UPDATE `concerns` SET `source_type`='TB_ANALYTIC' WHERE `id` IN (SELECT `concern_id` FROM `tb_analytics` WHERE `concern_id` IS NOT NULL);--> statement-breakpoint
INSERT INTO `concern_events` (`concern_id`,`engagement_id`,`event_type`,`body`,`metadata`,`actor_email`,`actor_name`,`created_at`) SELECT `id`,`engagement_id`,'CREATED',`description`,'{"migration":"0012"}',`created_by`,`created_by`,`created_at` FROM `concerns`;--> statement-breakpoint
INSERT INTO `practice_settings` (`id`,`updated_by`) VALUES (1,'system-migration');--> statement-breakpoint
CREATE UNIQUE INDEX `concerns_reference_idx` ON `concerns` (`reference`);--> statement-breakpoint
CREATE INDEX `concerns_engagement_id_idx` ON `concerns` (`engagement_id`);--> statement-breakpoint
CREATE INDEX `concerns_status_idx` ON `concerns` (`status`);--> statement-breakpoint
ALTER TABLE `documents` ADD `concern_id` integer REFERENCES concerns(id);--> statement-breakpoint
CREATE INDEX `documents_concern_id_idx` ON `documents` (`concern_id`);
