ALTER TABLE `documents` ADD `procedure_id` integer REFERENCES procedures(id);--> statement-breakpoint
ALTER TABLE `evidence_requests` ADD `procedure_id` integer REFERENCES procedures(id);--> statement-breakpoint
ALTER TABLE `procedures` ADD `guidance` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `procedures` ADD `evidence_summary` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `procedures` ADD `work_performed` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `procedures` ADD `conclusion` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `procedures` ADD `status` text DEFAULT 'NOT_STARTED' NOT NULL;--> statement-breakpoint
ALTER TABLE `procedures` ADD `prepared_by` text;--> statement-breakpoint
ALTER TABLE `procedures` ADD `prepared_at` text;--> statement-breakpoint
ALTER TABLE `procedures` ADD `reviewed_by` text;--> statement-breakpoint
ALTER TABLE `procedures` ADD `reviewed_at` text;--> statement-breakpoint
ALTER TABLE `signoffs` ADD `procedure_id` integer REFERENCES procedures(id);