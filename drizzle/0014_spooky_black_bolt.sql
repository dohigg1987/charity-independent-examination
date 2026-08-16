CREATE TABLE `tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenants_slug_unique` ON `tenants` (`slug`);--> statement-breakpoint
INSERT INTO `tenants` (`id`, `slug`, `name`, `status`)
VALUES ('00000000-0000-4000-8000-000000000001', 'clarity-ie-legacy', 'Clarity IE Practice', 'ACTIVE');--> statement-breakpoint
DROP INDEX `clients_charity_number_unique`;--> statement-breakpoint
ALTER TABLE `clients` ADD `tenant_id` text REFERENCES tenants(id);--> statement-breakpoint
ALTER TABLE `clients` ADD `public_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `clients_public_id_unique` ON `clients` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `clients_tenant_charity_unique` ON `clients` (`tenant_id`,`charity_number`);--> statement-breakpoint
CREATE INDEX `clients_tenant_status_idx` ON `clients` (`tenant_id`,`status`);--> statement-breakpoint
DROP INDEX `concerns_reference_idx`;--> statement-breakpoint
ALTER TABLE `concerns` ADD `tenant_id` text REFERENCES tenants(id);--> statement-breakpoint
ALTER TABLE `concerns` ADD `public_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `concerns_public_id_unique` ON `concerns` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `concerns_tenant_reference_unique` ON `concerns` (`tenant_id`,`reference`);--> statement-breakpoint
DROP INDEX `engagements_client_id_idx`;--> statement-breakpoint
ALTER TABLE `engagements` ADD `tenant_id` text REFERENCES tenants(id);--> statement-breakpoint
ALTER TABLE `engagements` ADD `public_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `engagements_public_id_unique` ON `engagements` (`public_id`);--> statement-breakpoint
CREATE INDEX `engagements_tenant_client_idx` ON `engagements` (`tenant_id`,`client_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `engagements_tenant_public_unique` ON `engagements` (`tenant_id`,`public_id`);--> statement-breakpoint
DROP INDEX `evidence_requests_reference_unique`;--> statement-breakpoint
ALTER TABLE `evidence_requests` ADD `tenant_id` text REFERENCES tenants(id);--> statement-breakpoint
ALTER TABLE `evidence_requests` ADD `public_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `evidence_requests_public_id_unique` ON `evidence_requests` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `evidence_requests_tenant_reference_unique` ON `evidence_requests` (`tenant_id`,`reference`);--> statement-breakpoint
DROP INDEX `procedures_task_id_idx`;--> statement-breakpoint
ALTER TABLE `procedures` ADD `tenant_id` text REFERENCES tenants(id);--> statement-breakpoint
ALTER TABLE `procedures` ADD `public_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `procedures_public_id_unique` ON `procedures` (`public_id`);--> statement-breakpoint
CREATE INDEX `procedures_tenant_task_idx` ON `procedures` (`tenant_id`,`task_id`);--> statement-breakpoint
DROP INDEX `tasks_engagement_id_idx`;--> statement-breakpoint
ALTER TABLE `tasks` ADD `tenant_id` text REFERENCES tenants(id);--> statement-breakpoint
ALTER TABLE `tasks` ADD `public_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_public_id_unique` ON `tasks` (`public_id`);--> statement-breakpoint
CREATE INDEX `tasks_tenant_engagement_idx` ON `tasks` (`tenant_id`,`engagement_id`);--> statement-breakpoint
DROP INDEX `users_email_unique`;--> statement-breakpoint
ALTER TABLE `users` ADD `tenant_id` text REFERENCES tenants(id);--> statement-breakpoint
ALTER TABLE `users` ADD `public_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `users_public_id_unique` ON `users` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_tenant_email_unique` ON `users` (`tenant_id`,`email`);--> statement-breakpoint
CREATE INDEX `users_tenant_status_idx` ON `users` (`tenant_id`,`status`);--> statement-breakpoint
ALTER TABLE `audit_events` ADD `tenant_id` text REFERENCES tenants(id);--> statement-breakpoint
ALTER TABLE `audit_events` ADD `public_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `audit_events_public_id_unique` ON `audit_events` (`public_id`);--> statement-breakpoint
ALTER TABLE `client_users` ADD `tenant_id` text REFERENCES tenants(id);--> statement-breakpoint
ALTER TABLE `client_users` ADD `public_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `client_users_public_id_unique` ON `client_users` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `client_users_tenant_client_email_unique` ON `client_users` (`tenant_id`,`client_id`,`email`);--> statement-breakpoint
ALTER TABLE `comments` ADD `tenant_id` text REFERENCES tenants(id);--> statement-breakpoint
ALTER TABLE `comments` ADD `public_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `comments_public_id_unique` ON `comments` (`public_id`);--> statement-breakpoint
ALTER TABLE `concern_events` ADD `tenant_id` text REFERENCES tenants(id);--> statement-breakpoint
ALTER TABLE `concern_events` ADD `public_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `concern_events_public_id_unique` ON `concern_events` (`public_id`);--> statement-breakpoint
ALTER TABLE `conversation_messages` ADD `tenant_id` text REFERENCES tenants(id);--> statement-breakpoint
ALTER TABLE `conversation_messages` ADD `public_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_messages_public_id_unique` ON `conversation_messages` (`public_id`);--> statement-breakpoint
ALTER TABLE `conversation_participants` ADD `tenant_id` text REFERENCES tenants(id);--> statement-breakpoint
ALTER TABLE `conversation_participants` ADD `public_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_participants_public_id_unique` ON `conversation_participants` (`public_id`);--> statement-breakpoint
ALTER TABLE `conversation_threads` ADD `tenant_id` text REFERENCES tenants(id);--> statement-breakpoint
ALTER TABLE `conversation_threads` ADD `public_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `conversation_threads_public_id_unique` ON `conversation_threads` (`public_id`);--> statement-breakpoint
ALTER TABLE `documents` ADD `tenant_id` text REFERENCES tenants(id);--> statement-breakpoint
ALTER TABLE `documents` ADD `public_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `documents_public_id_unique` ON `documents` (`public_id`);--> statement-breakpoint
ALTER TABLE `file_lock_events` ADD `tenant_id` text REFERENCES tenants(id);--> statement-breakpoint
ALTER TABLE `file_lock_events` ADD `public_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `file_lock_events_public_id_unique` ON `file_lock_events` (`public_id`);--> statement-breakpoint
ALTER TABLE `invitations` ADD `tenant_id` text REFERENCES tenants(id);--> statement-breakpoint
ALTER TABLE `invitations` ADD `public_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_public_id_unique` ON `invitations` (`public_id`);--> statement-breakpoint
ALTER TABLE `permanent_documents` ADD `tenant_id` text REFERENCES tenants(id);--> statement-breakpoint
ALTER TABLE `permanent_documents` ADD `public_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `permanent_documents_public_id_unique` ON `permanent_documents` (`public_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_practice_settings` (
	`tenant_id` text PRIMARY KEY NOT NULL,
	`concern_review_mode` text DEFAULT 'EXAMINER_JUDGEMENT' NOT NULL,
	`require_independent_concern_closure` integer DEFAULT false NOT NULL,
	`allow_procedure_self_review` integer DEFAULT false NOT NULL,
	`default_quality_review_mode` text DEFAULT 'NONE' NOT NULL,
	`file_lock_deadline_days` integer DEFAULT 60 NOT NULL,
	`retention_years` integer DEFAULT 7 NOT NULL,
	`updated_by` text DEFAULT 'system' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_practice_settings`("tenant_id", "concern_review_mode", "require_independent_concern_closure", "allow_procedure_self_review", "default_quality_review_mode", "file_lock_deadline_days", "retention_years", "updated_by", "updated_at") SELECT '00000000-0000-4000-8000-000000000001', "concern_review_mode", "require_independent_concern_closure", "allow_procedure_self_review", "default_quality_review_mode", "file_lock_deadline_days", "retention_years", "updated_by", "updated_at" FROM `practice_settings`;--> statement-breakpoint
DROP TABLE `practice_settings`;--> statement-breakpoint
ALTER TABLE `__new_practice_settings` RENAME TO `practice_settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `rate_limits` ADD `tenant_id` text REFERENCES tenants(id);--> statement-breakpoint
ALTER TABLE `review_notes` ADD `tenant_id` text REFERENCES tenants(id);--> statement-breakpoint
ALTER TABLE `review_notes` ADD `public_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `review_notes_public_id_unique` ON `review_notes` (`public_id`);--> statement-breakpoint
ALTER TABLE `signoffs` ADD `tenant_id` text REFERENCES tenants(id);--> statement-breakpoint
ALTER TABLE `signoffs` ADD `public_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `signoffs_public_id_unique` ON `signoffs` (`public_id`);--> statement-breakpoint
ALTER TABLE `tb_accounts` ADD `tenant_id` text REFERENCES tenants(id);--> statement-breakpoint
ALTER TABLE `tb_accounts` ADD `public_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `tb_accounts_public_id_unique` ON `tb_accounts` (`public_id`);--> statement-breakpoint
ALTER TABLE `tb_analytics` ADD `tenant_id` text REFERENCES tenants(id);--> statement-breakpoint
ALTER TABLE `tb_analytics` ADD `public_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `tb_analytics_public_id_unique` ON `tb_analytics` (`public_id`);--> statement-breakpoint
ALTER TABLE `tb_imports` ADD `tenant_id` text REFERENCES tenants(id);--> statement-breakpoint
ALTER TABLE `tb_imports` ADD `public_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `tb_imports_public_id_unique` ON `tb_imports` (`public_id`);--> statement-breakpoint
ALTER TABLE `tb_reconciliations` ADD `tenant_id` text REFERENCES tenants(id);--> statement-breakpoint
ALTER TABLE `tb_reconciliations` ADD `public_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `tb_reconciliations_public_id_unique` ON `tb_reconciliations` (`public_id`);--> statement-breakpoint
ALTER TABLE `trustees` ADD `tenant_id` text REFERENCES tenants(id);--> statement-breakpoint
ALTER TABLE `trustees` ADD `public_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `trustees_public_id_unique` ON `trustees` (`public_id`);--> statement-breakpoint
ALTER TABLE `workpaper_versions` ADD `tenant_id` text REFERENCES tenants(id);--> statement-breakpoint
ALTER TABLE `workpaper_versions` ADD `public_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `workpaper_versions_public_id_unique` ON `workpaper_versions` (`public_id`);
--> statement-breakpoint
UPDATE `clients` SET `tenant_id`='00000000-0000-4000-8000-000000000001', `public_id`=lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))) WHERE `tenant_id` IS NULL OR `public_id` IS NULL;
--> statement-breakpoint
UPDATE `users` SET `tenant_id`='00000000-0000-4000-8000-000000000001', `public_id`=lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))) WHERE `tenant_id` IS NULL OR `public_id` IS NULL;
--> statement-breakpoint
UPDATE `engagements` SET `tenant_id`='00000000-0000-4000-8000-000000000001', `public_id`=lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))) WHERE `tenant_id` IS NULL OR `public_id` IS NULL;
--> statement-breakpoint
UPDATE `tasks` SET `tenant_id`='00000000-0000-4000-8000-000000000001', `public_id`=lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))) WHERE `tenant_id` IS NULL OR `public_id` IS NULL;
--> statement-breakpoint
UPDATE `procedures` SET `tenant_id`='00000000-0000-4000-8000-000000000001', `public_id`=lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))) WHERE `tenant_id` IS NULL OR `public_id` IS NULL;
--> statement-breakpoint
UPDATE `workpaper_versions` SET `tenant_id`='00000000-0000-4000-8000-000000000001', `public_id`=lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))) WHERE `tenant_id` IS NULL OR `public_id` IS NULL;
--> statement-breakpoint
UPDATE `evidence_requests` SET `tenant_id`='00000000-0000-4000-8000-000000000001', `public_id`=lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))) WHERE `tenant_id` IS NULL OR `public_id` IS NULL;
--> statement-breakpoint
UPDATE `conversation_threads` SET `tenant_id`='00000000-0000-4000-8000-000000000001', `public_id`=lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))) WHERE `tenant_id` IS NULL OR `public_id` IS NULL;
--> statement-breakpoint
UPDATE `conversation_participants` SET `tenant_id`='00000000-0000-4000-8000-000000000001', `public_id`=lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))) WHERE `tenant_id` IS NULL OR `public_id` IS NULL;
--> statement-breakpoint
UPDATE `conversation_messages` SET `tenant_id`='00000000-0000-4000-8000-000000000001', `public_id`=lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))) WHERE `tenant_id` IS NULL OR `public_id` IS NULL;
--> statement-breakpoint
UPDATE `documents` SET `tenant_id`='00000000-0000-4000-8000-000000000001', `public_id`=lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))) WHERE `tenant_id` IS NULL OR `public_id` IS NULL;
--> statement-breakpoint
UPDATE `permanent_documents` SET `tenant_id`='00000000-0000-4000-8000-000000000001', `public_id`=lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))) WHERE `tenant_id` IS NULL OR `public_id` IS NULL;
--> statement-breakpoint
UPDATE `comments` SET `tenant_id`='00000000-0000-4000-8000-000000000001', `public_id`=lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))) WHERE `tenant_id` IS NULL OR `public_id` IS NULL;
--> statement-breakpoint
UPDATE `review_notes` SET `tenant_id`='00000000-0000-4000-8000-000000000001', `public_id`=lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))) WHERE `tenant_id` IS NULL OR `public_id` IS NULL;
--> statement-breakpoint
UPDATE `signoffs` SET `tenant_id`='00000000-0000-4000-8000-000000000001', `public_id`=lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))) WHERE `tenant_id` IS NULL OR `public_id` IS NULL;
--> statement-breakpoint
UPDATE `invitations` SET `tenant_id`='00000000-0000-4000-8000-000000000001', `public_id`=lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))) WHERE `tenant_id` IS NULL OR `public_id` IS NULL;
--> statement-breakpoint
UPDATE `trustees` SET `tenant_id`='00000000-0000-4000-8000-000000000001', `public_id`=lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))) WHERE `tenant_id` IS NULL OR `public_id` IS NULL;
--> statement-breakpoint
UPDATE `client_users` SET `tenant_id`='00000000-0000-4000-8000-000000000001', `public_id`=lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))) WHERE `tenant_id` IS NULL OR `public_id` IS NULL;
--> statement-breakpoint
UPDATE `audit_events` SET `tenant_id`='00000000-0000-4000-8000-000000000001', `public_id`=lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))) WHERE `tenant_id` IS NULL OR `public_id` IS NULL;
--> statement-breakpoint
UPDATE `concerns` SET `tenant_id`='00000000-0000-4000-8000-000000000001', `public_id`=lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))) WHERE `tenant_id` IS NULL OR `public_id` IS NULL;
--> statement-breakpoint
UPDATE `concern_events` SET `tenant_id`='00000000-0000-4000-8000-000000000001', `public_id`=lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))) WHERE `tenant_id` IS NULL OR `public_id` IS NULL;
--> statement-breakpoint
UPDATE `file_lock_events` SET `tenant_id`='00000000-0000-4000-8000-000000000001', `public_id`=lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))) WHERE `tenant_id` IS NULL OR `public_id` IS NULL;
--> statement-breakpoint
UPDATE `tb_imports` SET `tenant_id`='00000000-0000-4000-8000-000000000001', `public_id`=lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))) WHERE `tenant_id` IS NULL OR `public_id` IS NULL;
--> statement-breakpoint
UPDATE `tb_accounts` SET `tenant_id`='00000000-0000-4000-8000-000000000001', `public_id`=lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))) WHERE `tenant_id` IS NULL OR `public_id` IS NULL;
--> statement-breakpoint
UPDATE `tb_analytics` SET `tenant_id`='00000000-0000-4000-8000-000000000001', `public_id`=lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))) WHERE `tenant_id` IS NULL OR `public_id` IS NULL;
--> statement-breakpoint
UPDATE `tb_reconciliations` SET `tenant_id`='00000000-0000-4000-8000-000000000001', `public_id`=lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))) WHERE `tenant_id` IS NULL OR `public_id` IS NULL;
--> statement-breakpoint
CREATE TRIGGER `clients_tenant_insert_guard` BEFORE INSERT ON `clients`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'clients requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `clients_tenant_update_guard` BEFORE UPDATE OF `tenant_id`, `public_id` ON `clients`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'clients requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `users_tenant_insert_guard` BEFORE INSERT ON `users`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'users requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `users_tenant_update_guard` BEFORE UPDATE OF `tenant_id`, `public_id` ON `users`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'users requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `engagements_tenant_insert_guard` BEFORE INSERT ON `engagements`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'engagements requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `engagements_tenant_update_guard` BEFORE UPDATE OF `tenant_id`, `public_id` ON `engagements`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'engagements requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `tasks_tenant_insert_guard` BEFORE INSERT ON `tasks`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'tasks requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `tasks_tenant_update_guard` BEFORE UPDATE OF `tenant_id`, `public_id` ON `tasks`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'tasks requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `procedures_tenant_insert_guard` BEFORE INSERT ON `procedures`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'procedures requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `procedures_tenant_update_guard` BEFORE UPDATE OF `tenant_id`, `public_id` ON `procedures`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'procedures requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `workpaper_versions_tenant_insert_guard` BEFORE INSERT ON `workpaper_versions`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'workpaper_versions requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `workpaper_versions_tenant_update_guard` BEFORE UPDATE OF `tenant_id`, `public_id` ON `workpaper_versions`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'workpaper_versions requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `evidence_requests_tenant_insert_guard` BEFORE INSERT ON `evidence_requests`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'evidence_requests requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `evidence_requests_tenant_update_guard` BEFORE UPDATE OF `tenant_id`, `public_id` ON `evidence_requests`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'evidence_requests requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `conversation_threads_tenant_insert_guard` BEFORE INSERT ON `conversation_threads`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'conversation_threads requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `conversation_threads_tenant_update_guard` BEFORE UPDATE OF `tenant_id`, `public_id` ON `conversation_threads`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'conversation_threads requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `conversation_participants_tenant_insert_guard` BEFORE INSERT ON `conversation_participants`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'conversation_participants requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `conversation_participants_tenant_update_guard` BEFORE UPDATE OF `tenant_id`, `public_id` ON `conversation_participants`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'conversation_participants requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `conversation_messages_tenant_insert_guard` BEFORE INSERT ON `conversation_messages`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'conversation_messages requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `conversation_messages_tenant_update_guard` BEFORE UPDATE OF `tenant_id`, `public_id` ON `conversation_messages`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'conversation_messages requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `documents_tenant_insert_guard` BEFORE INSERT ON `documents`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'documents requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `documents_tenant_update_guard` BEFORE UPDATE OF `tenant_id`, `public_id` ON `documents`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'documents requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `permanent_documents_tenant_insert_guard` BEFORE INSERT ON `permanent_documents`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'permanent_documents requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `permanent_documents_tenant_update_guard` BEFORE UPDATE OF `tenant_id`, `public_id` ON `permanent_documents`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'permanent_documents requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `comments_tenant_insert_guard` BEFORE INSERT ON `comments`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'comments requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `comments_tenant_update_guard` BEFORE UPDATE OF `tenant_id`, `public_id` ON `comments`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'comments requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `review_notes_tenant_insert_guard` BEFORE INSERT ON `review_notes`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'review_notes requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `review_notes_tenant_update_guard` BEFORE UPDATE OF `tenant_id`, `public_id` ON `review_notes`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'review_notes requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `signoffs_tenant_insert_guard` BEFORE INSERT ON `signoffs`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'signoffs requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `signoffs_tenant_update_guard` BEFORE UPDATE OF `tenant_id`, `public_id` ON `signoffs`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'signoffs requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `invitations_tenant_insert_guard` BEFORE INSERT ON `invitations`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'invitations requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `invitations_tenant_update_guard` BEFORE UPDATE OF `tenant_id`, `public_id` ON `invitations`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'invitations requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `trustees_tenant_insert_guard` BEFORE INSERT ON `trustees`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'trustees requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `trustees_tenant_update_guard` BEFORE UPDATE OF `tenant_id`, `public_id` ON `trustees`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'trustees requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `client_users_tenant_insert_guard` BEFORE INSERT ON `client_users`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'client_users requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `client_users_tenant_update_guard` BEFORE UPDATE OF `tenant_id`, `public_id` ON `client_users`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'client_users requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `audit_events_tenant_insert_guard` BEFORE INSERT ON `audit_events`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'audit_events requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `audit_events_tenant_update_guard` BEFORE UPDATE OF `tenant_id`, `public_id` ON `audit_events`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'audit_events requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `concerns_tenant_insert_guard` BEFORE INSERT ON `concerns`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'concerns requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `concerns_tenant_update_guard` BEFORE UPDATE OF `tenant_id`, `public_id` ON `concerns`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'concerns requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `concern_events_tenant_insert_guard` BEFORE INSERT ON `concern_events`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'concern_events requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `concern_events_tenant_update_guard` BEFORE UPDATE OF `tenant_id`, `public_id` ON `concern_events`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'concern_events requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `file_lock_events_tenant_insert_guard` BEFORE INSERT ON `file_lock_events`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'file_lock_events requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `file_lock_events_tenant_update_guard` BEFORE UPDATE OF `tenant_id`, `public_id` ON `file_lock_events`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'file_lock_events requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `tb_imports_tenant_insert_guard` BEFORE INSERT ON `tb_imports`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'tb_imports requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `tb_imports_tenant_update_guard` BEFORE UPDATE OF `tenant_id`, `public_id` ON `tb_imports`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'tb_imports requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `tb_accounts_tenant_insert_guard` BEFORE INSERT ON `tb_accounts`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'tb_accounts requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `tb_accounts_tenant_update_guard` BEFORE UPDATE OF `tenant_id`, `public_id` ON `tb_accounts`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'tb_accounts requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `tb_analytics_tenant_insert_guard` BEFORE INSERT ON `tb_analytics`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'tb_analytics requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `tb_analytics_tenant_update_guard` BEFORE UPDATE OF `tenant_id`, `public_id` ON `tb_analytics`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'tb_analytics requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `tb_reconciliations_tenant_insert_guard` BEFORE INSERT ON `tb_reconciliations`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'tb_reconciliations requires tenant_id and public_id'); END;
--> statement-breakpoint
CREATE TRIGGER `tb_reconciliations_tenant_update_guard` BEFORE UPDATE OF `tenant_id`, `public_id` ON `tb_reconciliations`
WHEN NEW.`tenant_id` IS NULL OR NEW.`public_id` IS NULL
BEGIN SELECT RAISE(ABORT, 'tb_reconciliations requires tenant_id and public_id'); END;
--> statement-breakpoint
UPDATE `jurisdiction_rule_sets`
SET `notes`='Brought into law by the Charities Acts 1992 and 2011 (Substitution of Sums) Order 2026. Applies to financial years ending on or after 30 September 2026.',
    `source_title`='The Charities Acts 1992 and 2011 (Substitution of Sums) Order 2026',
    `source_url`='https://www.legislation.gov.uk/uksi/2026/427/made',
    `updated_by`='system-migration',
    `updated_at`=CURRENT_TIMESTAMP
WHERE `version`='CCEW-2026.2';
