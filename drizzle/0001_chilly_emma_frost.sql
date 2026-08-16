CREATE TABLE `client_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'CONTRIBUTOR' NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`last_access_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `trustees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`role` text DEFAULT 'TRUSTEE' NOT NULL,
	`appointment_date` text,
	`resignation_date` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `evidence_requests` ADD `task_id` integer REFERENCES tasks(id);--> statement-breakpoint
ALTER TABLE `tasks` ADD `phase` text DEFAULT 'Fieldwork' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `guidance` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `is_custom` integer DEFAULT false NOT NULL;