CREATE TABLE `jurisdiction_rule_sets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`jurisdiction_id` integer NOT NULL,
	`version` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`examination_floor` real DEFAULT 0 NOT NULL,
	`qualification_floor` real DEFAULT 0 NOT NULL,
	`audit_income` real DEFAULT 0 NOT NULL,
	`audit_income_inclusive` integer DEFAULT false NOT NULL,
	`asset_income_floor` real DEFAULT 0 NOT NULL,
	`audit_assets` real DEFAULT 0 NOT NULL,
	`qualification_floor_inclusive` integer DEFAULT false NOT NULL,
	`all_charities_scrutinised` integer DEFAULT false NOT NULL,
	`asset_test_basis` text DEFAULT 'INCOME_AND_ASSETS' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`source_title` text NOT NULL,
	`source_url` text NOT NULL,
	`published_at` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`jurisdiction_id`) REFERENCES `jurisdictions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `jurisdiction_rule_sets_jurisdiction_id_idx` ON `jurisdiction_rule_sets` (`jurisdiction_id`);--> statement-breakpoint
CREATE TABLE `jurisdictions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`regulator` text NOT NULL,
	`regulator_url` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`updated_by` text DEFAULT 'system' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jurisdictions_code_unique` ON `jurisdictions` (`code`);--> statement-breakpoint
CREATE TABLE `organisation_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`updated_by` text DEFAULT 'system' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organisation_types_code_unique` ON `organisation_types` (`code`);--> statement-breakpoint
ALTER TABLE `engagements` ADD `jurisdiction_rule_set_id` integer REFERENCES jurisdiction_rule_sets(id);