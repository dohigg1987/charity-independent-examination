CREATE TABLE `concerns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`engagement_id` integer NOT NULL,
	`task_id` integer,
	`procedure_id` integer,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`severity` text DEFAULT 'MEDIUM' NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`targeted_response` text DEFAULT '' NOT NULL,
	`resolution` text DEFAULT '' NOT NULL,
	`owner` text,
	`created_by` text NOT NULL,
	`resolved_by` text,
	`resolved_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`procedure_id`) REFERENCES `procedures`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `file_lock_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`engagement_id` integer NOT NULL,
	`action` text NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`snapshot_hash` text NOT NULL,
	`actor_email` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `engagements` ADD `jurisdiction` text DEFAULT 'ENGLAND_WALES' NOT NULL;--> statement-breakpoint
ALTER TABLE `engagements` ADD `fund_profile` text DEFAULT 'MULTI_FUND' NOT NULL;--> statement-breakpoint
ALTER TABLE `engagements` ADD `complexity` text DEFAULT 'STANDARD' NOT NULL;--> statement-breakpoint
ALTER TABLE `engagements` ADD `governing_document_audit` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `engagements` ADD `funder_audit` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `engagements` ADD `commission_audit` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `engagements` ADD `group_accounts_required` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `engagements` ADD `scope_conclusion` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `engagements` ADD `methodology_version` text DEFAULT 'CC32-2026.1' NOT NULL;--> statement-breakpoint
ALTER TABLE `engagements` ADD `quality_review_mode` text DEFAULT 'NONE' NOT NULL;--> statement-breakpoint
ALTER TABLE `engagements` ADD `quality_review_status` text DEFAULT 'NOT_REQUIRED' NOT NULL;--> statement-breakpoint
ALTER TABLE `engagements` ADD `quality_review_conclusion` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `engagements` ADD `quality_reviewed_by` text;--> statement-breakpoint
ALTER TABLE `engagements` ADD `quality_reviewed_at` text;--> statement-breakpoint
ALTER TABLE `engagements` ADD `locked_at` text;--> statement-breakpoint
ALTER TABLE `engagements` ADD `locked_by` text;--> statement-breakpoint
ALTER TABLE `engagements` ADD `reopened_at` text;--> statement-breakpoint
ALTER TABLE `engagements` ADD `reopened_by` text;--> statement-breakpoint
ALTER TABLE `engagements` ADD `reopen_reason` text;--> statement-breakpoint
ALTER TABLE `procedures` ADD `applicability` text DEFAULT 'APPLICABLE' NOT NULL;--> statement-breakpoint
ALTER TABLE `procedures` ADD `applicability_rationale` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `procedures` ADD `concern_identified` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `procedures` ADD `concern_summary` text DEFAULT '' NOT NULL;