-- Legacy audit rows pre-date enforced hash chaining. D1 does not expose a
-- cryptographic digest function to SQL migrations, so the upgrade seals the
-- complete pre-0017 history with a deterministic, independently verifiable
-- content fingerprint. Eight domain-separated FNV-1a 32-bit accumulators are
-- concatenated into a 64-character digest. The audit_legacy_seals row records
-- the algorithm, canonical form, row range and terminal anchor. All events
-- written after this migration continue to use SHA-256 in application code.
CREATE TABLE `__audit_legacy_fingerprints` (
	`id` integer PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`event_hash` text NOT NULL
);
--> statement-breakpoint
WITH RECURSIVE
`canonical` AS (
  SELECT
    `id`,
    `tenant_id`,
    'clarity-ie:legacy-audit:v1|' || json_array(
      `id`, `tenant_id`, `engagement_id`, `actor_email`, `action`,
      `entity_type`, `entity_id`, `detail`, `created_at`
    ) AS `payload`
  FROM `audit_events`
),
`digest` (`id`, `tenant_id`, `payload`, `position`, `h1`, `h2`, `h3`, `h4`, `h5`, `h6`, `h7`, `h8`) AS (
  SELECT `id`, `tenant_id`, `payload`, 1,
    2166136261, 33554467, 709607, 2246822519,
    3266489917, 668265263, 374761393, 2654435761
  FROM `canonical`
  UNION ALL
  SELECT `id`, `tenant_id`, `payload`, `position` + 1,
    ((((h1 | unicode(substr(`payload`, `position`, 1))) & ~(h1 & unicode(substr(`payload`, `position`, 1)))) * 16777619) & 4294967295),
    ((((h2 | unicode(substr(`payload`, `position`, 1))) & ~(h2 & unicode(substr(`payload`, `position`, 1)))) * 16777619) & 4294967295),
    ((((h3 | unicode(substr(`payload`, `position`, 1))) & ~(h3 & unicode(substr(`payload`, `position`, 1)))) * 16777619) & 4294967295),
    ((((h4 | unicode(substr(`payload`, `position`, 1))) & ~(h4 & unicode(substr(`payload`, `position`, 1)))) * 16777619) & 4294967295),
    ((((h5 | unicode(substr(`payload`, `position`, 1))) & ~(h5 & unicode(substr(`payload`, `position`, 1)))) * 16777619) & 4294967295),
    ((((h6 | unicode(substr(`payload`, `position`, 1))) & ~(h6 & unicode(substr(`payload`, `position`, 1)))) * 16777619) & 4294967295),
    ((((h7 | unicode(substr(`payload`, `position`, 1))) & ~(h7 & unicode(substr(`payload`, `position`, 1)))) * 16777619) & 4294967295),
    ((((h8 | unicode(substr(`payload`, `position`, 1))) & ~(h8 & unicode(substr(`payload`, `position`, 1)))) * 16777619) & 4294967295)
  FROM `digest`
  WHERE `position` <= length(`payload`)
)
INSERT INTO `__audit_legacy_fingerprints` (`id`, `tenant_id`, `event_hash`)
SELECT `id`, `tenant_id`,
  printf('%08x%08x%08x%08x%08x%08x%08x%08x', `h1`, `h2`, `h3`, `h4`, `h5`, `h6`, `h7`, `h8`)
FROM `digest`
WHERE `position` = length(`payload`) + 1;
--> statement-breakpoint
UPDATE `audit_events`
SET `event_hash`=(
  SELECT `event_hash`
  FROM `__audit_legacy_fingerprints` f
  WHERE f.`id`=`audit_events`.`id`
);
--> statement-breakpoint
WITH `ordered` AS (
  SELECT
    `id`,
    lag(`event_hash`) OVER (PARTITION BY `tenant_id` ORDER BY `id`) AS `previous_hash`
  FROM `audit_events`
)
UPDATE `audit_events`
SET `previous_hash`=(
  SELECT `previous_hash`
  FROM `ordered`
  WHERE `ordered`.`id`=`audit_events`.`id`
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_audit_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenant_id` text NOT NULL,
	`public_id` text NOT NULL,
	`engagement_id` integer,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`detail` text DEFAULT '{}' NOT NULL,
	`previous_hash` text,
	`event_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`engagement_id`) REFERENCES `engagements`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_audit_events`("id", "tenant_id", "public_id", "engagement_id", "actor_email", "action", "entity_type", "entity_id", "detail", "previous_hash", "event_hash", "created_at") SELECT "id", "tenant_id", "public_id", "engagement_id", "actor_email", "action", "entity_type", "entity_id", "detail", "previous_hash", "event_hash", "created_at" FROM `audit_events`;--> statement-breakpoint
DROP TABLE `audit_events`;--> statement-breakpoint
ALTER TABLE `__new_audit_events` RENAME TO `audit_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `audit_events_public_id_unique` ON `audit_events` (`public_id`);--> statement-breakpoint
CREATE INDEX `audit_events_engagement_id_idx` ON `audit_events` (`engagement_id`);--> statement-breakpoint
CREATE INDEX `audit_events_created_at_idx` ON `audit_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `audit_legacy_seals` (
	`tenant_id` text PRIMARY KEY NOT NULL,
	`algorithm` text DEFAULT 'FNV1A32X8-CODEPOINT-V1' NOT NULL,
	`canonical_version` text DEFAULT 'clarity-ie-legacy-audit-v1' NOT NULL,
	`first_event_id` integer NOT NULL,
	`last_event_id` integer NOT NULL,
	`event_count` integer NOT NULL,
	`genesis_hash` text NOT NULL,
	`anchor_hash` text NOT NULL,
	`sealed_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`first_event_id`) REFERENCES `audit_events`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`last_event_id`) REFERENCES `audit_events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `audit_legacy_seals` (
  `tenant_id`, `first_event_id`, `last_event_id`, `event_count`,
  `genesis_hash`, `anchor_hash`, `sealed_at`
)
SELECT
  history.`tenant_id`,
  history.`first_event_id`,
  history.`last_event_id`,
  history.`event_count`,
  first_event.`event_hash`,
  last_event.`event_hash`,
  history.`sealed_at`
FROM (
  SELECT
    `tenant_id`,
    min(`id`) AS `first_event_id`,
    max(`id`) AS `last_event_id`,
    count(*) AS `event_count`,
    max(`created_at`) AS `sealed_at`
  FROM `audit_events`
  GROUP BY `tenant_id`
) history
INNER JOIN `audit_events` first_event
  ON first_event.`id`=history.`first_event_id`
  AND first_event.`tenant_id`=history.`tenant_id`
INNER JOIN `audit_events` last_event
  ON last_event.`id`=history.`last_event_id`
  AND last_event.`tenant_id`=history.`tenant_id`;
--> statement-breakpoint
DROP TABLE `__audit_legacy_fingerprints`;
--> statement-breakpoint
DELETE FROM `audit_heads`;
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
CREATE TRIGGER `audit_events_insert_integrity_guard`
BEFORE INSERT ON `audit_events`
WHEN NEW.`event_hash` IS NULL
  OR length(NEW.`event_hash`) <> 64
  OR NEW.`event_hash` GLOB '*[^0-9a-f]*'
  OR (NEW.`previous_hash` IS NOT NULL AND (length(NEW.`previous_hash`) <> 64 OR NEW.`previous_hash` GLOB '*[^0-9a-f]*'))
BEGIN
  SELECT RAISE(ABORT, 'audit hash must be a 64-character lowercase digest');
END;
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
--> statement-breakpoint
CREATE TRIGGER `audit_events_append_only_update`
BEFORE UPDATE ON `audit_events`
BEGIN SELECT RAISE(ABORT, 'audit events are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `audit_events_append_only_delete`
BEFORE DELETE ON `audit_events`
BEGIN SELECT RAISE(ABORT, 'audit events are append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `audit_events_parent_tenant_insert` BEFORE INSERT ON `audit_events`
WHEN NEW.`engagement_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT, 'audit event parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `tenants_id_immutable` BEFORE UPDATE OF `id` ON `tenants`
WHEN NEW.`id` IS NOT OLD.`id`
BEGIN SELECT RAISE(ABORT, 'tenant identity is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `users_tenant_immutable` BEFORE UPDATE OF `tenant_id` ON `users`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id`
BEGIN SELECT RAISE(ABORT, 'users tenant is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `clients_tenant_immutable` BEFORE UPDATE OF `tenant_id` ON `clients`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id`
BEGIN SELECT RAISE(ABORT, 'clients tenant is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `engagements_tenant_immutable` BEFORE UPDATE OF `tenant_id` ON `engagements`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id`
BEGIN SELECT RAISE(ABORT, 'engagements tenant is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `tasks_tenant_immutable` BEFORE UPDATE OF `tenant_id` ON `tasks`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id`
BEGIN SELECT RAISE(ABORT, 'tasks tenant is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `procedures_tenant_immutable` BEFORE UPDATE OF `tenant_id` ON `procedures`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id`
BEGIN SELECT RAISE(ABORT, 'procedures tenant is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `workpaper_versions_tenant_immutable` BEFORE UPDATE OF `tenant_id` ON `workpaper_versions`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id`
BEGIN SELECT RAISE(ABORT, 'workpaper_versions tenant is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `evidence_requests_tenant_immutable` BEFORE UPDATE OF `tenant_id` ON `evidence_requests`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id`
BEGIN SELECT RAISE(ABORT, 'evidence_requests tenant is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `conversation_threads_tenant_immutable` BEFORE UPDATE OF `tenant_id` ON `conversation_threads`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id`
BEGIN SELECT RAISE(ABORT, 'conversation_threads tenant is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `conversation_participants_tenant_immutable` BEFORE UPDATE OF `tenant_id` ON `conversation_participants`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id`
BEGIN SELECT RAISE(ABORT, 'conversation_participants tenant is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `conversation_messages_tenant_immutable` BEFORE UPDATE OF `tenant_id` ON `conversation_messages`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id`
BEGIN SELECT RAISE(ABORT, 'conversation_messages tenant is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `documents_tenant_immutable` BEFORE UPDATE OF `tenant_id` ON `documents`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id`
BEGIN SELECT RAISE(ABORT, 'documents tenant is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `permanent_documents_tenant_immutable` BEFORE UPDATE OF `tenant_id` ON `permanent_documents`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id`
BEGIN SELECT RAISE(ABORT, 'permanent_documents tenant is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `comments_tenant_immutable` BEFORE UPDATE OF `tenant_id` ON `comments`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id`
BEGIN SELECT RAISE(ABORT, 'comments tenant is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `review_notes_tenant_immutable` BEFORE UPDATE OF `tenant_id` ON `review_notes`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id`
BEGIN SELECT RAISE(ABORT, 'review_notes tenant is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `signoffs_tenant_immutable` BEFORE UPDATE OF `tenant_id` ON `signoffs`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id`
BEGIN SELECT RAISE(ABORT, 'signoffs tenant is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `invitations_tenant_immutable` BEFORE UPDATE OF `tenant_id` ON `invitations`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id`
BEGIN SELECT RAISE(ABORT, 'invitations tenant is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `trustees_tenant_immutable` BEFORE UPDATE OF `tenant_id` ON `trustees`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id`
BEGIN SELECT RAISE(ABORT, 'trustees tenant is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `client_users_tenant_immutable` BEFORE UPDATE OF `tenant_id` ON `client_users`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id`
BEGIN SELECT RAISE(ABORT, 'client_users tenant is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `concerns_tenant_immutable` BEFORE UPDATE OF `tenant_id` ON `concerns`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id`
BEGIN SELECT RAISE(ABORT, 'concerns tenant is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `concern_events_tenant_immutable` BEFORE UPDATE OF `tenant_id` ON `concern_events`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id`
BEGIN SELECT RAISE(ABORT, 'concern_events tenant is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `file_lock_events_tenant_immutable` BEFORE UPDATE OF `tenant_id` ON `file_lock_events`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id`
BEGIN SELECT RAISE(ABORT, 'file_lock_events tenant is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `tb_imports_tenant_immutable` BEFORE UPDATE OF `tenant_id` ON `tb_imports`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id`
BEGIN SELECT RAISE(ABORT, 'tb_imports tenant is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `tb_accounts_tenant_immutable` BEFORE UPDATE OF `tenant_id` ON `tb_accounts`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id`
BEGIN SELECT RAISE(ABORT, 'tb_accounts tenant is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `tb_analytics_tenant_immutable` BEFORE UPDATE OF `tenant_id` ON `tb_analytics`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id`
BEGIN SELECT RAISE(ABORT, 'tb_analytics tenant is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `tb_reconciliations_tenant_immutable` BEFORE UPDATE OF `tenant_id` ON `tb_reconciliations`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id`
BEGIN SELECT RAISE(ABORT, 'tb_reconciliations tenant is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `practice_settings_tenant_immutable` BEFORE UPDATE OF `tenant_id` ON `practice_settings`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id`
BEGIN SELECT RAISE(ABORT, 'practice_settings tenant is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `audit_heads_tenant_immutable` BEFORE UPDATE OF `tenant_id` ON `audit_heads`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id`
BEGIN SELECT RAISE(ABORT, 'audit_heads tenant is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `rate_limits_tenant_immutable` BEFORE UPDATE OF `tenant_id` ON `rate_limits`
WHEN NEW.`tenant_id` IS NOT OLD.`tenant_id`
BEGIN SELECT RAISE(ABORT, 'rate_limits tenant is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `engagements_parent_tenant_insert` BEFORE INSERT ON `engagements`
WHEN NOT EXISTS (SELECT 1 FROM `clients` p WHERE p.`id`=NEW.`client_id` AND p.`tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT, 'engagements parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `engagements_parent_tenant_update` BEFORE UPDATE OF `tenant_id`, `client_id` ON `engagements`
WHEN NOT EXISTS (SELECT 1 FROM `clients` p WHERE p.`id`=NEW.`client_id` AND p.`tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT, 'engagements parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `tasks_parent_tenant_insert` BEFORE INSERT ON `tasks`
WHEN NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT, 'tasks parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `tasks_parent_tenant_update` BEFORE UPDATE OF `tenant_id`, `engagement_id` ON `tasks`
WHEN NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT, 'tasks parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `procedures_parent_tenant_insert` BEFORE INSERT ON `procedures`
WHEN NOT EXISTS (SELECT 1 FROM `tasks` p WHERE p.`id`=NEW.`task_id` AND p.`tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT, 'procedures parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `procedures_parent_tenant_update` BEFORE UPDATE OF `tenant_id`, `task_id` ON `procedures`
WHEN NOT EXISTS (SELECT 1 FROM `tasks` p WHERE p.`id`=NEW.`task_id` AND p.`tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT, 'procedures parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `evidence_requests_parent_tenant_insert` BEFORE INSERT ON `evidence_requests`
WHEN NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`tenant_id`=NEW.`tenant_id`) OR (NEW.`task_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `tasks` p WHERE p.`id`=NEW.`task_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`)) OR (NEW.`procedure_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `procedures` p INNER JOIN `tasks` t ON t.`id`=p.`task_id` AND t.`tenant_id`=p.`tenant_id` WHERE p.`id`=NEW.`procedure_id` AND p.`tenant_id`=NEW.`tenant_id` AND t.`engagement_id`=NEW.`engagement_id` AND (NEW.`task_id` IS NULL OR p.`task_id`=NEW.`task_id`)))
BEGIN SELECT RAISE(ABORT, 'evidence_requests parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `evidence_requests_parent_tenant_update` BEFORE UPDATE OF `tenant_id`, `engagement_id`, `task_id`, `procedure_id` ON `evidence_requests`
WHEN NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`tenant_id`=NEW.`tenant_id`) OR (NEW.`task_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `tasks` p WHERE p.`id`=NEW.`task_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`)) OR (NEW.`procedure_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `procedures` p INNER JOIN `tasks` t ON t.`id`=p.`task_id` AND t.`tenant_id`=p.`tenant_id` WHERE p.`id`=NEW.`procedure_id` AND p.`tenant_id`=NEW.`tenant_id` AND t.`engagement_id`=NEW.`engagement_id` AND (NEW.`task_id` IS NULL OR p.`task_id`=NEW.`task_id`)))
BEGIN SELECT RAISE(ABORT, 'evidence_requests parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `conversation_threads_parent_tenant_insert` BEFORE INSERT ON `conversation_threads`
WHEN NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`tenant_id`=NEW.`tenant_id`) OR (NEW.`request_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `evidence_requests` p WHERE p.`id`=NEW.`request_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`))
BEGIN SELECT RAISE(ABORT, 'conversation_threads parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `conversation_threads_parent_tenant_update` BEFORE UPDATE OF `tenant_id`, `engagement_id`, `request_id` ON `conversation_threads`
WHEN NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`tenant_id`=NEW.`tenant_id`) OR (NEW.`request_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `evidence_requests` p WHERE p.`id`=NEW.`request_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`))
BEGIN SELECT RAISE(ABORT, 'conversation_threads parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `conversation_participants_parent_tenant_insert` BEFORE INSERT ON `conversation_participants`
WHEN NOT EXISTS (SELECT 1 FROM `conversation_threads` p WHERE p.`id`=NEW.`thread_id` AND p.`tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT, 'conversation_participants parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `conversation_participants_parent_tenant_update` BEFORE UPDATE OF `tenant_id`, `thread_id` ON `conversation_participants`
WHEN NOT EXISTS (SELECT 1 FROM `conversation_threads` p WHERE p.`id`=NEW.`thread_id` AND p.`tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT, 'conversation_participants parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `conversation_messages_parent_tenant_insert` BEFORE INSERT ON `conversation_messages`
WHEN NOT EXISTS (SELECT 1 FROM `conversation_threads` p WHERE p.`id`=NEW.`thread_id` AND p.`tenant_id`=NEW.`tenant_id`) OR (NEW.`reply_to_message_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `conversation_messages` p WHERE p.`id`=NEW.`reply_to_message_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`thread_id`=NEW.`thread_id`))
BEGIN SELECT RAISE(ABORT, 'conversation_messages parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `conversation_messages_parent_tenant_update` BEFORE UPDATE OF `tenant_id`, `thread_id`, `reply_to_message_id` ON `conversation_messages`
WHEN NOT EXISTS (SELECT 1 FROM `conversation_threads` p WHERE p.`id`=NEW.`thread_id` AND p.`tenant_id`=NEW.`tenant_id`) OR (NEW.`reply_to_message_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `conversation_messages` p WHERE p.`id`=NEW.`reply_to_message_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`thread_id`=NEW.`thread_id`))
BEGIN SELECT RAISE(ABORT, 'conversation_messages parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `documents_parent_tenant_insert` BEFORE INSERT ON `documents`
WHEN NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`tenant_id`=NEW.`tenant_id`) OR (NEW.`request_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `evidence_requests` p WHERE p.`id`=NEW.`request_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`)) OR (NEW.`task_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `tasks` p WHERE p.`id`=NEW.`task_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`)) OR (NEW.`procedure_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `procedures` p INNER JOIN `tasks` t ON t.`id`=p.`task_id` AND t.`tenant_id`=p.`tenant_id` WHERE p.`id`=NEW.`procedure_id` AND p.`tenant_id`=NEW.`tenant_id` AND t.`engagement_id`=NEW.`engagement_id` AND (NEW.`task_id` IS NULL OR p.`task_id`=NEW.`task_id`))) OR (NEW.`concern_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `concerns` p WHERE p.`id`=NEW.`concern_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`)) OR (NEW.`conversation_thread_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `conversation_threads` p WHERE p.`id`=NEW.`conversation_thread_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`)) OR (NEW.`conversation_message_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `conversation_messages` m INNER JOIN `conversation_threads` t ON t.`id`=m.`thread_id` AND t.`tenant_id`=m.`tenant_id` WHERE m.`id`=NEW.`conversation_message_id` AND m.`tenant_id`=NEW.`tenant_id` AND t.`engagement_id`=NEW.`engagement_id` AND (NEW.`conversation_thread_id` IS NULL OR m.`thread_id`=NEW.`conversation_thread_id`)))
BEGIN SELECT RAISE(ABORT, 'documents parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `documents_parent_tenant_update` BEFORE UPDATE OF `tenant_id`, `engagement_id`, `request_id`, `task_id`, `procedure_id`, `concern_id`, `conversation_thread_id`, `conversation_message_id` ON `documents`
WHEN NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`tenant_id`=NEW.`tenant_id`) OR (NEW.`request_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `evidence_requests` p WHERE p.`id`=NEW.`request_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`)) OR (NEW.`task_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `tasks` p WHERE p.`id`=NEW.`task_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`)) OR (NEW.`procedure_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `procedures` p INNER JOIN `tasks` t ON t.`id`=p.`task_id` AND t.`tenant_id`=p.`tenant_id` WHERE p.`id`=NEW.`procedure_id` AND p.`tenant_id`=NEW.`tenant_id` AND t.`engagement_id`=NEW.`engagement_id` AND (NEW.`task_id` IS NULL OR p.`task_id`=NEW.`task_id`))) OR (NEW.`concern_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `concerns` p WHERE p.`id`=NEW.`concern_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`)) OR (NEW.`conversation_thread_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `conversation_threads` p WHERE p.`id`=NEW.`conversation_thread_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`)) OR (NEW.`conversation_message_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `conversation_messages` m INNER JOIN `conversation_threads` t ON t.`id`=m.`thread_id` AND t.`tenant_id`=m.`tenant_id` WHERE m.`id`=NEW.`conversation_message_id` AND m.`tenant_id`=NEW.`tenant_id` AND t.`engagement_id`=NEW.`engagement_id` AND (NEW.`conversation_thread_id` IS NULL OR m.`thread_id`=NEW.`conversation_thread_id`)))
BEGIN SELECT RAISE(ABORT, 'documents parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `comments_parent_tenant_insert` BEFORE INSERT ON `comments`
WHEN NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`tenant_id`=NEW.`tenant_id`) OR (NEW.`task_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `tasks` p WHERE p.`id`=NEW.`task_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`)) OR (NEW.`request_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `evidence_requests` p WHERE p.`id`=NEW.`request_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`))
BEGIN SELECT RAISE(ABORT, 'comments parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `comments_parent_tenant_update` BEFORE UPDATE OF `tenant_id`, `engagement_id`, `task_id`, `request_id` ON `comments`
WHEN NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`tenant_id`=NEW.`tenant_id`) OR (NEW.`task_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `tasks` p WHERE p.`id`=NEW.`task_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`)) OR (NEW.`request_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `evidence_requests` p WHERE p.`id`=NEW.`request_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`))
BEGIN SELECT RAISE(ABORT, 'comments parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `review_notes_parent_tenant_insert` BEFORE INSERT ON `review_notes`
WHEN NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`tenant_id`=NEW.`tenant_id`) OR (NEW.`task_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `tasks` p WHERE p.`id`=NEW.`task_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`))
BEGIN SELECT RAISE(ABORT, 'review_notes parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `review_notes_parent_tenant_update` BEFORE UPDATE OF `tenant_id`, `engagement_id`, `task_id` ON `review_notes`
WHEN NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`tenant_id`=NEW.`tenant_id`) OR (NEW.`task_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `tasks` p WHERE p.`id`=NEW.`task_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`))
BEGIN SELECT RAISE(ABORT, 'review_notes parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `trustees_parent_tenant_insert` BEFORE INSERT ON `trustees`
WHEN NOT EXISTS (SELECT 1 FROM `clients` p WHERE p.`id`=NEW.`client_id` AND p.`tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT, 'trustees parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `trustees_parent_tenant_update` BEFORE UPDATE OF `tenant_id`, `client_id` ON `trustees`
WHEN NOT EXISTS (SELECT 1 FROM `clients` p WHERE p.`id`=NEW.`client_id` AND p.`tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT, 'trustees parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `client_users_parent_tenant_insert` BEFORE INSERT ON `client_users`
WHEN NOT EXISTS (SELECT 1 FROM `clients` p WHERE p.`id`=NEW.`client_id` AND p.`tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT, 'client_users parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `client_users_parent_tenant_update` BEFORE UPDATE OF `tenant_id`, `client_id` ON `client_users`
WHEN NOT EXISTS (SELECT 1 FROM `clients` p WHERE p.`id`=NEW.`client_id` AND p.`tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT, 'client_users parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `concerns_parent_tenant_insert` BEFORE INSERT ON `concerns`
WHEN NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`tenant_id`=NEW.`tenant_id`) OR (NEW.`task_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `tasks` p WHERE p.`id`=NEW.`task_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`)) OR (NEW.`procedure_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `procedures` p INNER JOIN `tasks` t ON t.`id`=p.`task_id` AND t.`tenant_id`=p.`tenant_id` WHERE p.`id`=NEW.`procedure_id` AND p.`tenant_id`=NEW.`tenant_id` AND t.`engagement_id`=NEW.`engagement_id` AND (NEW.`task_id` IS NULL OR p.`task_id`=NEW.`task_id`)))
BEGIN SELECT RAISE(ABORT, 'concerns parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `audit_heads_integrity_insert` BEFORE INSERT ON `audit_heads`
WHEN NEW.`last_hash` IS NOT (
  SELECT e.`event_hash` FROM `audit_events` e
  WHERE e.`tenant_id`=NEW.`tenant_id`
  ORDER BY e.`id` DESC LIMIT 1
)
BEGIN SELECT RAISE(ABORT, 'audit head must match the latest event'); END;
--> statement-breakpoint
CREATE TRIGGER `audit_heads_integrity_update` BEFORE UPDATE OF `last_hash` ON `audit_heads`
WHEN NEW.`last_hash` IS NOT (
  SELECT e.`event_hash` FROM `audit_events` e
  WHERE e.`tenant_id`=NEW.`tenant_id`
  ORDER BY e.`id` DESC LIMIT 1
)
BEGIN SELECT RAISE(ABORT, 'audit head must match the latest event'); END;
--> statement-breakpoint
CREATE TRIGGER `audit_heads_integrity_delete` BEFORE DELETE ON `audit_heads`
WHEN EXISTS (SELECT 1 FROM `audit_events` e WHERE e.`tenant_id`=OLD.`tenant_id`)
BEGIN SELECT RAISE(ABORT, 'audit heads with events cannot be deleted'); END;
--> statement-breakpoint
CREATE TRIGGER `audit_legacy_seals_immutable_insert` BEFORE INSERT ON `audit_legacy_seals`
BEGIN SELECT RAISE(ABORT, 'legacy audit seals are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `audit_legacy_seals_immutable_update` BEFORE UPDATE ON `audit_legacy_seals`
BEGIN SELECT RAISE(ABORT, 'legacy audit seals are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `audit_legacy_seals_immutable_delete` BEFORE DELETE ON `audit_legacy_seals`
BEGIN SELECT RAISE(ABORT, 'legacy audit seals are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `workpaper_versions_parent_tenant_insert` BEFORE INSERT ON `workpaper_versions`
WHEN NOT EXISTS (SELECT 1 FROM `tasks` p WHERE p.`id`=NEW.`task_id` AND p.`tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT, 'workpaper_versions parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `workpaper_versions_parent_tenant_update` BEFORE UPDATE OF `tenant_id`, `task_id` ON `workpaper_versions`
WHEN NOT EXISTS (SELECT 1 FROM `tasks` p WHERE p.`id`=NEW.`task_id` AND p.`tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT, 'workpaper_versions parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `permanent_documents_parent_tenant_insert` BEFORE INSERT ON `permanent_documents`
WHEN NOT EXISTS (SELECT 1 FROM `clients` p WHERE p.`id`=NEW.`client_id` AND p.`tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT, 'permanent_documents parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `permanent_documents_parent_tenant_update` BEFORE UPDATE OF `tenant_id`, `client_id` ON `permanent_documents`
WHEN NOT EXISTS (SELECT 1 FROM `clients` p WHERE p.`id`=NEW.`client_id` AND p.`tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT, 'permanent_documents parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `signoffs_parent_tenant_insert` BEFORE INSERT ON `signoffs`
WHEN NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`tenant_id`=NEW.`tenant_id`) OR (NEW.`task_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `tasks` p WHERE p.`id`=NEW.`task_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`)) OR (NEW.`procedure_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `procedures` p INNER JOIN `tasks` t ON t.`id`=p.`task_id` AND t.`tenant_id`=p.`tenant_id` WHERE p.`id`=NEW.`procedure_id` AND p.`tenant_id`=NEW.`tenant_id` AND t.`engagement_id`=NEW.`engagement_id` AND (NEW.`task_id` IS NULL OR p.`task_id`=NEW.`task_id`)))
BEGIN SELECT RAISE(ABORT, 'signoffs parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `signoffs_parent_tenant_update` BEFORE UPDATE OF `tenant_id`, `engagement_id`, `task_id`, `procedure_id` ON `signoffs`
WHEN NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`tenant_id`=NEW.`tenant_id`) OR (NEW.`task_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `tasks` p WHERE p.`id`=NEW.`task_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`)) OR (NEW.`procedure_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `procedures` p INNER JOIN `tasks` t ON t.`id`=p.`task_id` AND t.`tenant_id`=p.`tenant_id` WHERE p.`id`=NEW.`procedure_id` AND p.`tenant_id`=NEW.`tenant_id` AND t.`engagement_id`=NEW.`engagement_id` AND (NEW.`task_id` IS NULL OR p.`task_id`=NEW.`task_id`)))
BEGIN SELECT RAISE(ABORT, 'signoffs parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `invitations_parent_tenant_insert` BEFORE INSERT ON `invitations`
WHEN NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT, 'invitations parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `invitations_parent_tenant_update` BEFORE UPDATE OF `tenant_id`, `engagement_id` ON `invitations`
WHEN NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT, 'invitations parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `concern_events_parent_tenant_insert` BEFORE INSERT ON `concern_events`
WHEN NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`tenant_id`=NEW.`tenant_id`) OR NOT EXISTS (SELECT 1 FROM `concerns` p WHERE p.`id`=NEW.`concern_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`)
BEGIN SELECT RAISE(ABORT, 'concern_events parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `concern_events_parent_tenant_update` BEFORE UPDATE OF `tenant_id`, `concern_id`, `engagement_id` ON `concern_events`
WHEN NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`tenant_id`=NEW.`tenant_id`) OR NOT EXISTS (SELECT 1 FROM `concerns` p WHERE p.`id`=NEW.`concern_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`)
BEGIN SELECT RAISE(ABORT, 'concern_events parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `file_lock_events_parent_tenant_insert` BEFORE INSERT ON `file_lock_events`
WHEN NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT, 'file_lock_events parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `file_lock_events_parent_tenant_update` BEFORE UPDATE OF `tenant_id`, `engagement_id` ON `file_lock_events`
WHEN NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT, 'file_lock_events parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `tb_imports_parent_tenant_insert` BEFORE INSERT ON `tb_imports`
WHEN NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`tenant_id`=NEW.`tenant_id`) OR (NEW.`document_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `documents` p WHERE p.`id`=NEW.`document_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`))
BEGIN SELECT RAISE(ABORT, 'tb_imports parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `tb_imports_parent_tenant_update` BEFORE UPDATE OF `tenant_id`, `engagement_id`, `document_id` ON `tb_imports`
WHEN NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`tenant_id`=NEW.`tenant_id`) OR (NEW.`document_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `documents` p WHERE p.`id`=NEW.`document_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`))
BEGIN SELECT RAISE(ABORT, 'tb_imports parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `tb_accounts_parent_tenant_insert` BEFORE INSERT ON `tb_accounts`
WHEN NOT EXISTS (SELECT 1 FROM `tb_imports` p WHERE p.`id`=NEW.`tb_import_id` AND p.`tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT, 'tb_accounts parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `tb_accounts_parent_tenant_update` BEFORE UPDATE OF `tenant_id`, `tb_import_id` ON `tb_accounts`
WHEN NOT EXISTS (SELECT 1 FROM `tb_imports` p WHERE p.`id`=NEW.`tb_import_id` AND p.`tenant_id`=NEW.`tenant_id`)
BEGIN SELECT RAISE(ABORT, 'tb_accounts parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `tb_analytics_parent_tenant_insert` BEFORE INSERT ON `tb_analytics`
WHEN NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`tenant_id`=NEW.`tenant_id`) OR NOT EXISTS (SELECT 1 FROM `tb_imports` p WHERE p.`id`=NEW.`tb_import_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`) OR (NEW.`account_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `tb_accounts` a WHERE a.`id`=NEW.`account_id` AND a.`tenant_id`=NEW.`tenant_id` AND a.`tb_import_id`=NEW.`tb_import_id`)) OR (NEW.`linked_task_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `tasks` p WHERE p.`id`=NEW.`linked_task_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`)) OR (NEW.`linked_procedure_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `procedures` p INNER JOIN `tasks` t ON t.`id`=p.`task_id` AND t.`tenant_id`=p.`tenant_id` WHERE p.`id`=NEW.`linked_procedure_id` AND p.`tenant_id`=NEW.`tenant_id` AND t.`engagement_id`=NEW.`engagement_id` AND (NEW.`linked_task_id` IS NULL OR p.`task_id`=NEW.`linked_task_id`))) OR (NEW.`concern_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `concerns` p WHERE p.`id`=NEW.`concern_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`))
BEGIN SELECT RAISE(ABORT, 'tb_analytics parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `tb_analytics_parent_tenant_update` BEFORE UPDATE OF `tenant_id`, `engagement_id`, `tb_import_id`, `account_id`, `linked_task_id`, `linked_procedure_id`, `concern_id` ON `tb_analytics`
WHEN NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`tenant_id`=NEW.`tenant_id`) OR NOT EXISTS (SELECT 1 FROM `tb_imports` p WHERE p.`id`=NEW.`tb_import_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`) OR (NEW.`account_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `tb_accounts` a WHERE a.`id`=NEW.`account_id` AND a.`tenant_id`=NEW.`tenant_id` AND a.`tb_import_id`=NEW.`tb_import_id`)) OR (NEW.`linked_task_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `tasks` p WHERE p.`id`=NEW.`linked_task_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`)) OR (NEW.`linked_procedure_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `procedures` p INNER JOIN `tasks` t ON t.`id`=p.`task_id` AND t.`tenant_id`=p.`tenant_id` WHERE p.`id`=NEW.`linked_procedure_id` AND p.`tenant_id`=NEW.`tenant_id` AND t.`engagement_id`=NEW.`engagement_id` AND (NEW.`linked_task_id` IS NULL OR p.`task_id`=NEW.`linked_task_id`))) OR (NEW.`concern_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `concerns` p WHERE p.`id`=NEW.`concern_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`))
BEGIN SELECT RAISE(ABORT, 'tb_analytics parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `tb_reconciliations_parent_tenant_insert` BEFORE INSERT ON `tb_reconciliations`
WHEN NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`tenant_id`=NEW.`tenant_id`) OR NOT EXISTS (SELECT 1 FROM `tb_imports` p WHERE p.`id`=NEW.`tb_import_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`)
BEGIN SELECT RAISE(ABORT, 'tb_reconciliations parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `tb_reconciliations_parent_tenant_update` BEFORE UPDATE OF `tenant_id`, `engagement_id`, `tb_import_id` ON `tb_reconciliations`
WHEN NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`tenant_id`=NEW.`tenant_id`) OR NOT EXISTS (SELECT 1 FROM `tb_imports` p WHERE p.`id`=NEW.`tb_import_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`)
BEGIN SELECT RAISE(ABORT, 'tb_reconciliations parent belongs to another tenant'); END;
--> statement-breakpoint
CREATE TRIGGER `concerns_parent_tenant_update` BEFORE UPDATE OF `tenant_id`, `engagement_id`, `task_id`, `procedure_id` ON `concerns`
WHEN NOT EXISTS (SELECT 1 FROM `engagements` p WHERE p.`id`=NEW.`engagement_id` AND p.`tenant_id`=NEW.`tenant_id`) OR (NEW.`task_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `tasks` p WHERE p.`id`=NEW.`task_id` AND p.`tenant_id`=NEW.`tenant_id` AND p.`engagement_id`=NEW.`engagement_id`)) OR (NEW.`procedure_id` IS NOT NULL AND NOT EXISTS (SELECT 1 FROM `procedures` p INNER JOIN `tasks` t ON t.`id`=p.`task_id` AND t.`tenant_id`=p.`tenant_id` WHERE p.`id`=NEW.`procedure_id` AND p.`tenant_id`=NEW.`tenant_id` AND t.`engagement_id`=NEW.`engagement_id` AND (NEW.`task_id` IS NULL OR p.`task_id`=NEW.`task_id`)))
BEGIN SELECT RAISE(ABORT, 'concerns parent belongs to another tenant'); END;
--> statement-breakpoint
