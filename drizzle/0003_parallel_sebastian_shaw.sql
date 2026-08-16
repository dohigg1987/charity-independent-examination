CREATE TABLE `permanent_documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`category` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`byte_size` integer NOT NULL,
	`storage_key` text NOT NULL,
	`sha256` text NOT NULL,
	`uploaded_by` text NOT NULL,
	`status` text DEFAULT 'CURRENT' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `permanent_documents_storage_key_unique` ON `permanent_documents` (`storage_key`);--> statement-breakpoint
ALTER TABLE `documents` ADD `file_section` text DEFAULT 'WORKPAPER' NOT NULL;