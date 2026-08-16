CREATE INDEX `audit_events_engagement_id_idx` ON `audit_events` (`engagement_id`);--> statement-breakpoint
CREATE INDEX `audit_events_created_at_idx` ON `audit_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `client_users_client_id_idx` ON `client_users` (`client_id`);--> statement-breakpoint
CREATE INDEX `client_users_email_idx` ON `client_users` (`email`);--> statement-breakpoint
CREATE INDEX `documents_engagement_id_idx` ON `documents` (`engagement_id`);--> statement-breakpoint
CREATE INDEX `documents_request_id_idx` ON `documents` (`request_id`);--> statement-breakpoint
CREATE INDEX `engagements_client_id_idx` ON `engagements` (`client_id`);--> statement-breakpoint
CREATE INDEX `evidence_requests_engagement_id_idx` ON `evidence_requests` (`engagement_id`);--> statement-breakpoint
CREATE INDEX `evidence_requests_task_id_idx` ON `evidence_requests` (`task_id`);--> statement-breakpoint
CREATE INDEX `procedures_task_id_idx` ON `procedures` (`task_id`);--> statement-breakpoint
CREATE INDEX `tasks_engagement_id_idx` ON `tasks` (`engagement_id`);--> statement-breakpoint
CREATE INDEX `tb_accounts_tb_import_id_idx` ON `tb_accounts` (`tb_import_id`);--> statement-breakpoint
CREATE INDEX `tb_analytics_engagement_id_idx` ON `tb_analytics` (`engagement_id`);--> statement-breakpoint
CREATE INDEX `tb_analytics_tb_import_id_idx` ON `tb_analytics` (`tb_import_id`);--> statement-breakpoint
CREATE INDEX `tb_imports_engagement_id_idx` ON `tb_imports` (`engagement_id`);--> statement-breakpoint
CREATE INDEX `tb_reconciliations_engagement_id_idx` ON `tb_reconciliations` (`engagement_id`);--> statement-breakpoint
CREATE INDEX `tb_reconciliations_tb_import_id_idx` ON `tb_reconciliations` (`tb_import_id`);