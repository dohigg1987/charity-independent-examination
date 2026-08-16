CREATE TABLE `conversation_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`thread_id` integer NOT NULL,
	`reply_to_message_id` integer,
	`author_email` text NOT NULL,
	`author_name` text NOT NULL,
	`author_type` text NOT NULL,
	`body` text NOT NULL,
	`delivery_status` text DEFAULT 'DELIVERED' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `conversation_threads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `conversation_messages_thread_id_idx` ON `conversation_messages` (`thread_id`);--> statement-breakpoint
CREATE INDEX `conversation_messages_created_at_idx` ON `conversation_messages` (`created_at`);--> statement-breakpoint
CREATE TABLE `conversation_participants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`thread_id` integer NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`participant_type` text NOT NULL,
	`notifications_enabled` integer DEFAULT true NOT NULL,
	`last_read_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `conversation_threads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_participants_thread_email_idx` ON `conversation_participants` (`thread_id`,`email`);--> statement-breakpoint
CREATE INDEX `conversation_participants_email_idx` ON `conversation_participants` (`email`);--> statement-breakpoint
CREATE TABLE `conversation_threads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`engagement_id` integer NOT NULL,
	`request_id` integer,
	`subject` text NOT NULL,
	`category` text DEFAULT 'GENERAL' NOT NULL,
	`priority` text DEFAULT 'NORMAL' NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`assigned_to` text,
	`created_by` text NOT NULL,
	`last_message_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`resolved_at` text,
	`resolved_by` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`request_id`) REFERENCES `evidence_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `conversation_threads_engagement_id_idx` ON `conversation_threads` (`engagement_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_threads_request_id_idx` ON `conversation_threads` (`request_id`);--> statement-breakpoint
CREATE INDEX `conversation_threads_status_idx` ON `conversation_threads` (`status`);--> statement-breakpoint
CREATE INDEX `conversation_threads_last_message_at_idx` ON `conversation_threads` (`last_message_at`);--> statement-breakpoint
ALTER TABLE `documents` ADD `conversation_thread_id` integer REFERENCES conversation_threads(id);--> statement-breakpoint
ALTER TABLE `documents` ADD `conversation_message_id` integer REFERENCES conversation_messages(id);--> statement-breakpoint
CREATE INDEX `documents_conversation_thread_id_idx` ON `documents` (`conversation_thread_id`);--> statement-breakpoint
CREATE INDEX `documents_conversation_message_id_idx` ON `documents` (`conversation_message_id`);
--> statement-breakpoint
INSERT INTO `conversation_threads` (
	`engagement_id`, `request_id`, `subject`, `category`, `priority`, `status`,
	`assigned_to`, `created_by`, `last_message_at`, `resolved_at`, `resolved_by`,
	`created_at`, `updated_at`
)
SELECT
	r.`engagement_id`, r.`id`, r.`title`, 'EVIDENCE',
	CASE WHEN r.`status` = 'OVERDUE' THEN 'HIGH' ELSE 'NORMAL' END,
	CASE WHEN r.`status` = 'RECEIVED' THEN 'RESOLVED' ELSE 'WAITING_CLIENT' END,
	NULL, 'migration@clarity.ie',
	COALESCE((SELECT MAX(c.`created_at`) FROM `comments` c WHERE c.`request_id` = r.`id` AND c.`visibility` = 'CLIENT'), r.`created_at`),
	CASE WHEN r.`status` = 'RECEIVED' THEN r.`received_at` ELSE NULL END,
	CASE WHEN r.`status` = 'RECEIVED' THEN 'migration@clarity.ie' ELSE NULL END,
	r.`created_at`, CURRENT_TIMESTAMP
FROM `evidence_requests` r;
--> statement-breakpoint
INSERT INTO `conversation_participants` (
	`thread_id`, `email`, `name`, `participant_type`, `notifications_enabled`, `created_at`
)
SELECT t.`id`, lower(r.`contact_email`), r.`contact_name`, 'CLIENT', true, r.`created_at`
FROM `conversation_threads` t
JOIN `evidence_requests` r ON r.`id` = t.`request_id`;
--> statement-breakpoint
INSERT INTO `conversation_messages` (
	`thread_id`, `author_email`, `author_name`, `author_type`, `body`, `delivery_status`, `created_at`
)
SELECT t.`id`, 'migration@clarity.ie', 'Examination team', 'PRACTICE', r.`description`, 'DELIVERED', r.`created_at`
FROM `conversation_threads` t
JOIN `evidence_requests` r ON r.`id` = t.`request_id`;
--> statement-breakpoint
INSERT INTO `conversation_messages` (
	`thread_id`, `author_email`, `author_name`, `author_type`, `body`, `delivery_status`, `created_at`
)
SELECT
	t.`id`, c.`author_email`, c.`author_name`,
	CASE WHEN EXISTS (
		SELECT 1 FROM `client_users` cu WHERE lower(cu.`email`) = lower(c.`author_email`)
	) THEN 'CLIENT' ELSE 'PRACTICE' END,
	c.`body`, 'DELIVERED', c.`created_at`
FROM `comments` c
JOIN `conversation_threads` t ON t.`request_id` = c.`request_id`
WHERE c.`visibility` = 'CLIENT';
