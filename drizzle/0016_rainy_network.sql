CREATE TABLE `audit_heads` (
	`tenant_id` text PRIMARY KEY NOT NULL,
	`last_hash` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `audit_heads` (`tenant_id`, `last_hash`, `updated_at`)
SELECT e.`tenant_id`, e.`event_hash`, e.`created_at`
FROM `audit_events` e
INNER JOIN (
  SELECT `tenant_id`, MAX(`id`) AS `last_id`
  FROM `audit_events`
  GROUP BY `tenant_id`
) latest ON latest.`tenant_id`=e.`tenant_id` AND latest.`last_id`=e.`id`;
--> statement-breakpoint
CREATE TRIGGER `audit_events_chain_guard`
BEFORE INSERT ON `audit_events`
WHEN COALESCE(NEW.`previous_hash`, '') <> COALESCE(
  (SELECT `last_hash` FROM `audit_heads` WHERE `tenant_id`=NEW.`tenant_id`),
  ''
)
BEGIN
  SELECT RAISE(ABORT, 'audit chain conflict');
END;
--> statement-breakpoint
CREATE TRIGGER `audit_events_chain_advance`
AFTER INSERT ON `audit_events`
BEGIN
  INSERT INTO `audit_heads` (`tenant_id`, `last_hash`, `updated_at`)
  VALUES (NEW.`tenant_id`, NEW.`event_hash`, NEW.`created_at`)
  ON CONFLICT(`tenant_id`) DO UPDATE SET
    `last_hash`=excluded.`last_hash`,
    `updated_at`=excluded.`updated_at`;
END;
