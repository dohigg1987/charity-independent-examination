CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `audit_events` ADD `previous_hash` text;--> statement-breakpoint
ALTER TABLE `audit_events` ADD `event_hash` text;