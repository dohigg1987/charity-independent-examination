CREATE TABLE `client_contacts` (
 `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `tenant_id` text NOT NULL, `public_id` text NOT NULL,
 `client_id` integer NOT NULL, `name` text NOT NULL, `role` text DEFAULT '' NOT NULL, `email` text, `phone` text,
 `is_primary` integer DEFAULT false NOT NULL, `status` text DEFAULT 'ACTIVE' NOT NULL,
 `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL, `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
 FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
 FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `client_contacts_public_id_unique` ON `client_contacts` (`public_id`);--> statement-breakpoint
CREATE INDEX `client_contacts_tenant_client_idx` ON `client_contacts` (`tenant_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `client_contacts_tenant_status_idx` ON `client_contacts` (`tenant_id`,`status`);--> statement-breakpoint
CREATE TABLE `client_activities` (
 `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `tenant_id` text NOT NULL, `public_id` text NOT NULL,
 `client_id` integer NOT NULL, `engagement_id` integer, `contact_id` integer,
 `activity_type` text DEFAULT 'NOTE' NOT NULL, `subject` text NOT NULL, `detail` text DEFAULT '' NOT NULL,
 `occurred_at` text NOT NULL, `next_action` text DEFAULT '' NOT NULL, `follow_up_date` text,
 `completed_at` text, `completed_by` text, `created_by` text NOT NULL, `created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
 FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
 FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
 FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action,
 FOREIGN KEY (`contact_id`) REFERENCES `client_contacts`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `client_activities_public_id_unique` ON `client_activities` (`public_id`);--> statement-breakpoint
CREATE INDEX `client_activities_tenant_client_idx` ON `client_activities` (`tenant_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `client_activities_tenant_follow_up_idx` ON `client_activities` (`tenant_id`,`follow_up_date`);--> statement-breakpoint
CREATE INDEX `client_activities_engagement_idx` ON `client_activities` (`engagement_id`);--> statement-breakpoint
CREATE TRIGGER `client_contacts_identity_immutable` BEFORE UPDATE OF `tenant_id`, `public_id` ON `client_contacts`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id` OR NEW.`public_id` IS NOT OLD.`public_id`
BEGIN SELECT RAISE(ABORT, 'client contact identity is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `client_contacts_parent_tenant_insert` BEFORE INSERT ON `client_contacts`
WHEN NOT EXISTS (SELECT 1 FROM `clients` p WHERE p.`id`=NEW.`client_id` AND p.`tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT, 'client contact parent belongs to another tenant'); END;--> statement-breakpoint
CREATE TRIGGER `client_contacts_parent_tenant_update` BEFORE UPDATE OF `tenant_id`, `client_id` ON `client_contacts`
WHEN NOT EXISTS (SELECT 1 FROM `clients` p WHERE p.`id`=NEW.`client_id` AND p.`tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT, 'client contact parent belongs to another tenant'); END;--> statement-breakpoint
CREATE TRIGGER `client_activities_identity_immutable` BEFORE UPDATE OF `tenant_id`, `public_id` ON `client_activities`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id` OR NEW.`public_id` IS NOT OLD.`public_id`
BEGIN SELECT RAISE(ABORT, 'client activity identity is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `client_activities_parent_tenant_insert` BEFORE INSERT ON `client_activities`
WHEN NOT EXISTS (SELECT 1 FROM `clients` p WHERE p.`id`=NEW.`client_id` AND p.`tenant_id`=NEW.`tenant_id`)
 OR (NEW.`engagement_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`client_id`=NEW.`client_id` AND p.`tenant_id`=NEW.`tenant_id`))
 OR (NEW.`contact_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `client_contacts` p WHERE p.`id`=NEW.`contact_id` AND p.`client_id`=NEW.`client_id` AND p.`tenant_id`=NEW.`tenant_id`))
BEGIN SELECT RAISE(ABORT, 'client activity parent belongs to another tenant or client'); END;--> statement-breakpoint
CREATE TRIGGER `client_activities_parent_tenant_update` BEFORE UPDATE OF `tenant_id`, `client_id`, `engagement_id`, `contact_id` ON `client_activities`
WHEN NOT EXISTS (SELECT 1 FROM `clients` p WHERE p.`id`=NEW.`client_id` AND p.`tenant_id`=NEW.`tenant_id`)
 OR (NEW.`engagement_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`client_id`=NEW.`client_id` AND p.`tenant_id`=NEW.`tenant_id`))
 OR (NEW.`contact_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `client_contacts` p WHERE p.`id`=NEW.`contact_id` AND p.`client_id`=NEW.`client_id` AND p.`tenant_id`=NEW.`tenant_id`))
BEGIN SELECT RAISE(ABORT, 'client activity parent belongs to another tenant or client'); END;
