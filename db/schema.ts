import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

const tenantColumns = () => ({
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  publicId: text("public_id")
    .notNull()
    .unique()
    .$defaultFn(() => crypto.randomUUID()),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ...tenantColumns(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("EXAMINER"),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("users_tenant_email_unique").on(table.tenantId, table.email),
  index("users_tenant_status_idx").on(table.tenantId, table.status),
]);
export const clients = sqliteTable("clients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ...tenantColumns(),
  name: text("name").notNull(),
  charityNumber: text("charity_number").notNull(),
  companyNumber: text("company_number"),
  legalForm: text("legal_form").notNull(),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("clients_tenant_charity_unique").on(table.tenantId, table.charityNumber),
  index("clients_tenant_status_idx").on(table.tenantId, table.status),
]);
export const jurisdictions = sqliteTable("jurisdictions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  regulator: text("regulator").notNull(),
  regulatorUrl: text("regulator_url").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  updatedBy: text("updated_by").notNull().default("system"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export const jurisdictionRuleSets = sqliteTable(
  "jurisdiction_rule_sets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    jurisdictionId: integer("jurisdiction_id")
      .notNull()
      .references(() => jurisdictions.id),
    version: text("version").notNull(),
    status: text("status").notNull().default("DRAFT"),
    effectiveFrom: text("effective_from").notNull(),
    effectiveTo: text("effective_to"),
    effectiveDateBasis: text("effective_date_basis")
      .notNull()
      .default("PERIOD_END"),
    examinationFloor: real("examination_floor").notNull().default(0),
    qualificationFloor: real("qualification_floor").notNull().default(0),
    auditIncome: real("audit_income").notNull().default(0),
    auditIncomeInclusive: integer("audit_income_inclusive", { mode: "boolean" })
      .notNull()
      .default(false),
    assetIncomeFloor: real("asset_income_floor").notNull().default(0),
    auditAssets: real("audit_assets").notNull().default(0),
    qualificationFloorInclusive: integer("qualification_floor_inclusive", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    allCharitiesScrutinised: integer("all_charities_scrutinised", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    assetTestBasis: text("asset_test_basis").notNull().default("INCOME_AND_ASSETS"),
    notes: text("notes").notNull().default(""),
    sourceTitle: text("source_title").notNull(),
    sourceUrl: text("source_url").notNull(),
    publishedAt: text("published_at"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedBy: text("updated_by").notNull(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("jurisdiction_rule_sets_jurisdiction_id_idx").on(
      table.jurisdictionId,
    ),
  ],
);
export const organisationTypes = sqliteTable("organisation_types", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  updatedBy: text("updated_by").notNull().default("system"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export const practiceSettings = sqliteTable("practice_settings", {
  tenantId: text("tenant_id")
    .primaryKey()
    .references(() => tenants.id),
  concernReviewMode: text("concern_review_mode")
    .notNull()
    .default("EXAMINER_JUDGEMENT"),
  requireIndependentConcernClosure: integer(
    "require_independent_concern_closure",
    { mode: "boolean" },
  )
    .notNull()
    .default(false),
  allowProcedureSelfReview: integer("allow_procedure_self_review", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  defaultQualityReviewMode: text("default_quality_review_mode")
    .notNull()
    .default("NONE"),
  fileLockDeadlineDays: integer("file_lock_deadline_days")
    .notNull()
    .default(60),
  retentionYears: integer("retention_years").notNull().default(7),
  updatedBy: text("updated_by").notNull().default("system"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export const engagements = sqliteTable(
  "engagements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ...tenantColumns(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id),
    periodEnd: text("period_end").notNull(),
    periodStart: text("period_start"),
    accountingBasis: text("accounting_basis").notNull(),
    grossIncome: real("gross_income").notNull().default(0),
    grossAssets: real("gross_assets").notNull().default(0),
    materiality: real("materiality").notNull().default(0),
    risk: text("risk").notNull().default("STANDARD"),
    status: text("status").notNull().default("PLANNING"),
    rowVersion: integer("row_version").notNull().default(1),
    jurisdiction: text("jurisdiction").notNull().default("ENGLAND_WALES"),
    jurisdictionRuleSetId: integer("jurisdiction_rule_set_id").references(
      () => jurisdictionRuleSets.id,
    ),
    fundProfile: text("fund_profile").notNull().default("MULTI_FUND"),
    complexity: text("complexity").notNull().default("STANDARD"),
    governingDocumentAudit: integer("governing_document_audit", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    funderAudit: integer("funder_audit", { mode: "boolean" })
      .notNull()
      .default(false),
    commissionAudit: integer("commission_audit", { mode: "boolean" })
      .notNull()
      .default(false),
    groupAccountsRequired: integer("group_accounts_required", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    scopeConclusion: text("scope_conclusion").notNull().default(""),
    methodologyVersion: text("methodology_version")
      .notNull()
      .default("CC32-2026.1"),
    qualityReviewMode: text("quality_review_mode").notNull().default("NONE"),
    qualityReviewStatus: text("quality_review_status")
      .notNull()
      .default("NOT_REQUIRED"),
    qualityReviewConclusion: text("quality_review_conclusion")
      .notNull()
      .default(""),
    qualityReviewedBy: text("quality_reviewed_by"),
    qualityReviewedAt: text("quality_reviewed_at"),
    trusteeApproved: integer("trustee_approved", { mode: "boolean" })
      .notNull()
      .default(false),
    materialSignificanceAssessed: integer("material_significance_assessed", {
      mode: "boolean",
    })
      .notNull()
      .default(false),
    reportConclusion: text("report_conclusion"),
    lockedAt: text("locked_at"),
    lockedBy: text("locked_by"),
    reopenedAt: text("reopened_at"),
    reopenedBy: text("reopened_by"),
    reopenReason: text("reopen_reason"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("engagements_tenant_client_idx").on(table.tenantId, table.clientId),
    uniqueIndex("engagements_tenant_public_unique").on(table.tenantId, table.publicId),
  ],
);
export const tasks = sqliteTable(
  "tasks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ...tenantColumns(),
    engagementId: integer("engagement_id")
      .notNull()
      .references(() => engagements.id),
    direction: integer("direction").notNull(),
    title: text("title").notNull(),
    objective: text("objective").notNull(),
    phase: text("phase").notNull().default("Fieldwork"),
    guidance: text("guidance").notNull().default(""),
    isCustom: integer("is_custom", { mode: "boolean" })
      .notNull()
      .default(false),
    status: text("status").notNull().default("NOT_STARTED"),
    rowVersion: integer("row_version").notNull().default(1),
    conclusion: text("conclusion").notNull().default(""),
    preparedBy: text("prepared_by"),
    preparedAt: text("prepared_at"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: text("reviewed_at"),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("tasks_tenant_engagement_idx").on(table.tenantId, table.engagementId)],
);
export const procedures = sqliteTable(
  "procedures",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ...tenantColumns(),
    taskId: integer("task_id")
      .notNull()
      .references(() => tasks.id),
    sequence: integer("sequence").notNull(),
    text: text("text").notNull(),
    guidance: text("guidance").notNull().default(""),
    applicability: text("applicability").notNull().default("APPLICABLE"),
    applicabilityRationale: text("applicability_rationale")
      .notNull()
      .default(""),
    concernIdentified: integer("concern_identified", { mode: "boolean" })
      .notNull()
      .default(false),
    concernSummary: text("concern_summary").notNull().default(""),
    evidenceSummary: text("evidence_summary").notNull().default(""),
    workPerformed: text("work_performed").notNull().default(""),
    conclusion: text("conclusion").notNull().default(""),
    status: text("status").notNull().default("NOT_STARTED"),
    rowVersion: integer("row_version").notNull().default(1),
    preparedBy: text("prepared_by"),
    preparedAt: text("prepared_at"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: text("reviewed_at"),
    completed: integer("completed", { mode: "boolean" })
      .notNull()
      .default(false),
    completedBy: text("completed_by"),
    completedAt: text("completed_at"),
  },
  (table) => [index("procedures_tenant_task_idx").on(table.tenantId, table.taskId)],
);
export const workpaperVersions = sqliteTable("workpaper_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ...tenantColumns(),
  taskId: integer("task_id")
    .notNull()
    .references(() => tasks.id),
  version: integer("version").notNull(),
  conclusion: text("conclusion").notNull(),
  status: text("status").notNull(),
  contentHash: text("content_hash").notNull(),
  actorEmail: text("actor_email").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const evidenceRequests = sqliteTable(
  "evidence_requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ...tenantColumns(),
    engagementId: integer("engagement_id")
      .notNull()
      .references(() => engagements.id),
    taskId: integer("task_id").references(() => tasks.id),
    procedureId: integer("procedure_id").references(() => procedures.id),
    reference: text("reference").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    contactName: text("contact_name").notNull(),
    contactEmail: text("contact_email").notNull(),
    dueDate: text("due_date").notNull(),
    status: text("status").notNull().default("AWAITING_CLIENT"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    receivedAt: text("received_at"),
  },
  (table) => [
    index("evidence_requests_engagement_id_idx").on(table.engagementId),
    index("evidence_requests_task_id_idx").on(table.taskId),
    uniqueIndex("evidence_requests_tenant_reference_unique").on(table.tenantId, table.reference),
  ],
);
export const conversationThreads = sqliteTable(
  "conversation_threads",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ...tenantColumns(),
    engagementId: integer("engagement_id")
      .notNull()
      .references(() => engagements.id),
    requestId: integer("request_id").references(() => evidenceRequests.id),
    subject: text("subject").notNull(),
    category: text("category").notNull().default("GENERAL"),
    priority: text("priority").notNull().default("NORMAL"),
    status: text("status").notNull().default("OPEN"),
    rowVersion: integer("row_version").notNull().default(1),
    assignedTo: text("assigned_to"),
    createdBy: text("created_by").notNull(),
    lastMessageAt: text("last_message_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    resolvedAt: text("resolved_at"),
    resolvedBy: text("resolved_by"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("conversation_threads_engagement_id_idx").on(table.engagementId),
    uniqueIndex("conversation_threads_request_id_idx").on(table.requestId),
    index("conversation_threads_status_idx").on(table.status),
    index("conversation_threads_last_message_at_idx").on(table.lastMessageAt),
  ],
);
export const conversationParticipants = sqliteTable(
  "conversation_participants",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ...tenantColumns(),
    threadId: integer("thread_id")
      .notNull()
      .references(() => conversationThreads.id),
    email: text("email").notNull(),
    name: text("name").notNull(),
    participantType: text("participant_type").notNull(),
    notificationsEnabled: integer("notifications_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    lastReadAt: text("last_read_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("conversation_participants_thread_email_idx").on(
      table.threadId,
      table.email,
    ),
    index("conversation_participants_email_idx").on(table.email),
  ],
);
export const conversationMessages = sqliteTable(
  "conversation_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ...tenantColumns(),
    threadId: integer("thread_id")
      .notNull()
      .references(() => conversationThreads.id),
    replyToMessageId: integer("reply_to_message_id"),
    authorEmail: text("author_email").notNull(),
    authorName: text("author_name").notNull(),
    authorType: text("author_type").notNull(),
    body: text("body").notNull(),
    deliveryStatus: text("delivery_status").notNull().default("DELIVERED"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("conversation_messages_thread_id_idx").on(table.threadId),
    index("conversation_messages_created_at_idx").on(table.createdAt),
  ],
);
export const documents = sqliteTable(
  "documents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ...tenantColumns(),
    engagementId: integer("engagement_id")
      .notNull()
      .references(() => engagements.id),
    requestId: integer("request_id").references(() => evidenceRequests.id),
    taskId: integer("task_id").references(() => tasks.id),
    procedureId: integer("procedure_id").references(() => procedures.id),
    concernId: integer("concern_id").references(() => concerns.id),
    conversationThreadId: integer("conversation_thread_id").references(
      () => conversationThreads.id,
    ),
    conversationMessageId: integer("conversation_message_id").references(
      () => conversationMessages.id,
    ),
    fileSection: text("file_section").notNull().default("WORKPAPER"),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    sha256: text("sha256").notNull(),
    uploadedBy: text("uploaded_by").notNull(),
    malwareStatus: text("malware_status").notNull().default("STORED"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("documents_engagement_id_idx").on(table.engagementId),
    index("documents_request_id_idx").on(table.requestId),
    index("documents_concern_id_idx").on(table.concernId),
    index("documents_conversation_thread_id_idx").on(
      table.conversationThreadId,
    ),
    index("documents_conversation_message_id_idx").on(
      table.conversationMessageId,
    ),
  ],
);
export const permanentDocuments = sqliteTable("permanent_documents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ...tenantColumns(),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id),
  category: text("category").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  storageKey: text("storage_key").notNull().unique(),
  sha256: text("sha256").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  status: text("status").notNull().default("CURRENT"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const comments = sqliteTable("comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ...tenantColumns(),
  engagementId: integer("engagement_id")
    .notNull()
    .references(() => engagements.id),
  taskId: integer("task_id").references(() => tasks.id),
  requestId: integer("request_id").references(() => evidenceRequests.id),
  authorEmail: text("author_email").notNull(),
  authorName: text("author_name").notNull(),
  visibility: text("visibility").notNull().default("INTERNAL"),
  body: text("body").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const reviewNotes = sqliteTable("review_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ...tenantColumns(),
  engagementId: integer("engagement_id")
    .notNull()
    .references(() => engagements.id),
  taskId: integer("task_id").references(() => tasks.id),
  reference: text("reference").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  severity: text("severity").notNull(),
  status: text("status").notNull().default("OPEN"),
  raisedBy: text("raised_by").notNull(),
  response: text("response"),
  clearedBy: text("cleared_by"),
  clearedAt: text("cleared_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const signoffs = sqliteTable("signoffs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ...tenantColumns(),
  engagementId: integer("engagement_id")
    .notNull()
    .references(() => engagements.id),
  taskId: integer("task_id").references(() => tasks.id),
  procedureId: integer("procedure_id").references(() => procedures.id),
  type: text("type").notNull(),
  statement: text("statement").notNull(),
  snapshotHash: text("snapshot_hash").notNull(),
  signedBy: text("signed_by").notNull(),
  signedAt: text("signed_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const invitations = sqliteTable("invitations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ...tenantColumns(),
  engagementId: integer("engagement_id")
    .notNull()
    .references(() => engagements.id),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  role: text("role").notNull().default("CLIENT_CONTRIBUTOR"),
  expiresAt: text("expires_at").notNull(),
  revokedAt: text("revoked_at"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const trustees = sqliteTable("trustees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ...tenantColumns(),
  clientId: integer("client_id")
    .notNull()
    .references(() => clients.id),
  personType: text("person_type").notNull().default("TRUSTEE"),
  name: text("name").notNull(),
  email: text("email"),
  role: text("role").notNull().default("TRUSTEE"),
  appointmentDate: text("appointment_date"),
  resignationDate: text("resignation_date"),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const clientUsers = sqliteTable(
  "client_users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ...tenantColumns(),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id),
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: text("role").notNull().default("CONTRIBUTOR"),
    status: text("status").notNull().default("ACTIVE"),
    lastAccessAt: text("last_access_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("client_users_client_id_idx").on(table.clientId),
    index("client_users_email_idx").on(table.email),
    uniqueIndex("client_users_tenant_client_email_unique").on(table.tenantId, table.clientId, table.email),
  ],
);
export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ...tenantColumns(),
    engagementId: integer("engagement_id").references(() => engagements.id),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    detail: text("detail").notNull().default("{}"),
    previousHash: text("previous_hash"),
    eventHash: text("event_hash").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("audit_events_engagement_id_idx").on(table.engagementId),
    index("audit_events_created_at_idx").on(table.createdAt),
  ],
);
export const auditHeads = sqliteTable("audit_heads", {
  tenantId: text("tenant_id")
    .primaryKey()
    .references(() => tenants.id),
  lastHash: text("last_hash"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
/**
 * Immutable boundary for audit rows that existed before enforced SHA-256
 * chaining. Rows through lastEventId use the documented deterministic legacy
 * fingerprint; later audit rows use the application SHA-256 canonical form.
 */
export const auditLegacySeals = sqliteTable("audit_legacy_seals", {
  tenantId: text("tenant_id")
    .primaryKey()
    .references(() => tenants.id),
  algorithm: text("algorithm")
    .notNull()
    .default("FNV1A32X8-CODEPOINT-V1"),
  canonicalVersion: text("canonical_version")
    .notNull()
    .default("clarity-ie-legacy-audit-v1"),
  firstEventId: integer("first_event_id")
    .notNull()
    .references(() => auditEvents.id),
  lastEventId: integer("last_event_id")
    .notNull()
    .references(() => auditEvents.id),
  eventCount: integer("event_count").notNull(),
  genesisHash: text("genesis_hash").notNull(),
  anchorHash: text("anchor_hash").notNull(),
  sealedAt: text("sealed_at").notNull(),
});
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  tenantId: text("tenant_id").references(() => tenants.id),
  windowStart: integer("window_start").notNull(),
  count: integer("count").notNull().default(0),
});
export const concerns = sqliteTable(
  "concerns",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ...tenantColumns(),
    engagementId: integer("engagement_id")
      .notNull()
      .references(() => engagements.id),
    taskId: integer("task_id").references(() => tasks.id),
    procedureId: integer("procedure_id").references(() => procedures.id),
    reference: text("reference").notNull().default(""),
    sourceType: text("source_type").notNull().default("MANUAL"),
    category: text("category").notNull().default("GENERAL"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    severity: text("severity").notNull().default("MEDIUM"),
    status: text("status").notNull().default("OPEN"),
    rowVersion: integer("row_version").notNull().default(1),
    targetedResponse: text("targeted_response").notNull().default(""),
    managementResponse: text("management_response").notNull().default(""),
    examinerConclusion: text("examiner_conclusion").notNull().default(""),
    reportingAssessment: text("reporting_assessment")
      .notNull()
      .default("UNDETERMINED"),
    resolution: text("resolution").notNull().default(""),
    owner: text("owner"),
    createdBy: text("created_by").notNull(),
    submittedBy: text("submitted_by"),
    submittedAt: text("submitted_at"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: text("reviewed_at"),
    reviewConclusion: text("review_conclusion").notNull().default(""),
    closureHash: text("closure_hash"),
    resolvedBy: text("resolved_by"),
    resolvedAt: text("resolved_at"),
    reopenedBy: text("reopened_by"),
    reopenedAt: text("reopened_at"),
    reopenReason: text("reopen_reason"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("concerns_tenant_reference_unique").on(table.tenantId, table.reference),
    index("concerns_engagement_id_idx").on(table.engagementId),
    index("concerns_status_idx").on(table.status),
  ],
);
export const concernEvents = sqliteTable(
  "concern_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ...tenantColumns(),
    concernId: integer("concern_id")
      .notNull()
      .references(() => concerns.id),
    engagementId: integer("engagement_id")
      .notNull()
      .references(() => engagements.id),
    eventType: text("event_type").notNull(),
    body: text("body").notNull().default(""),
    metadata: text("metadata").notNull().default("{}"),
    actorEmail: text("actor_email").notNull(),
    actorName: text("actor_name").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("concern_events_concern_id_idx").on(table.concernId),
    index("concern_events_engagement_id_idx").on(table.engagementId),
  ],
);
export const fileLockEvents = sqliteTable("file_lock_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ...tenantColumns(),
  engagementId: integer("engagement_id")
    .notNull()
    .references(() => engagements.id),
  action: text("action").notNull(),
  reason: text("reason").notNull().default(""),
  snapshotHash: text("snapshot_hash").notNull(),
  actorEmail: text("actor_email").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
export const tbImports = sqliteTable(
  "tb_imports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ...tenantColumns(),
    engagementId: integer("engagement_id")
      .notNull()
      .references(() => engagements.id),
    documentId: integer("document_id").references(() => documents.id),
    version: integer("version").notNull(),
    fileName: text("file_name").notNull(),
    sourceFormat: text("source_format").notNull().default("CSV"),
    status: text("status").notNull().default("IMPORTED"),
    rowCount: integer("row_count").notNull().default(0),
    debitTotal: real("debit_total").notNull().default(0),
    creditTotal: real("credit_total").notNull().default(0),
    netTotal: real("net_total").notNull().default(0),
    isBalanced: integer("is_balanced", { mode: "boolean" })
      .notNull()
      .default(false),
    validationIssues: text("validation_issues").notNull().default("[]"),
    analysisConclusion: text("analysis_conclusion").notNull().default(""),
    preparedBy: text("prepared_by"),
    preparedAt: text("prepared_at"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: text("reviewed_at"),
    uploadedBy: text("uploaded_by").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("tb_imports_engagement_id_idx").on(table.engagementId)],
);
export const tbAccounts = sqliteTable(
  "tb_accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ...tenantColumns(),
    tbImportId: integer("tb_import_id")
      .notNull()
      .references(() => tbImports.id),
    accountCode: text("account_code").notNull(),
    accountName: text("account_name").notNull(),
    fund: text("fund").notNull().default("Unrestricted"),
    statementLine: text("statement_line").notNull().default("UNMAPPED"),
    noteReference: text("note_reference").notNull().default(""),
    debit: real("debit").notNull().default(0),
    credit: real("credit").notNull().default(0),
    currentBalance: real("current_balance").notNull().default(0),
    priorBalance: real("prior_balance").notNull().default(0),
    budgetBalance: real("budget_balance").notNull().default(0),
    mappingStatus: text("mapping_status").notNull().default("UNMAPPED"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("tb_accounts_tb_import_id_idx").on(table.tbImportId)],
);
export const tbAnalytics = sqliteTable(
  "tb_analytics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ...tenantColumns(),
    engagementId: integer("engagement_id")
      .notNull()
      .references(() => engagements.id),
    tbImportId: integer("tb_import_id")
      .notNull()
      .references(() => tbImports.id),
    accountId: integer("account_id").references(() => tbAccounts.id),
    type: text("type").notNull(),
    title: text("title").notNull(),
    expectation: text("expectation").notNull(),
    actual: real("actual").notNull().default(0),
    comparator: real("comparator").notNull().default(0),
    variance: real("variance").notNull().default(0),
    variancePercent: real("variance_percent").notNull().default(0),
    significanceThreshold: real("significance_threshold").notNull().default(0),
    severity: text("severity").notNull().default("MEDIUM"),
    status: text("status").notNull().default("OPEN"),
    explanation: text("explanation").notNull().default(""),
    targetedWork: text("targeted_work").notNull().default(""),
    conclusion: text("conclusion").notNull().default(""),
    linkedTaskId: integer("linked_task_id").references(() => tasks.id),
    linkedProcedureId: integer("linked_procedure_id").references(
      () => procedures.id,
    ),
    concernId: integer("concern_id").references(() => concerns.id),
    preparedBy: text("prepared_by"),
    preparedAt: text("prepared_at"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: text("reviewed_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("tb_analytics_engagement_id_idx").on(table.engagementId),
    index("tb_analytics_tb_import_id_idx").on(table.tbImportId),
  ],
);
export const tbReconciliations = sqliteTable(
  "tb_reconciliations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ...tenantColumns(),
    engagementId: integer("engagement_id")
      .notNull()
      .references(() => engagements.id),
    tbImportId: integer("tb_import_id")
      .notNull()
      .references(() => tbImports.id),
    statementLine: text("statement_line").notNull(),
    tbAmount: real("tb_amount").notNull().default(0),
    accountsAmount: real("accounts_amount").notNull().default(0),
    difference: real("difference").notNull().default(0),
    status: text("status").notNull().default("NOT_RECONCILED"),
    explanation: text("explanation").notNull().default(""),
    preparedBy: text("prepared_by"),
    preparedAt: text("prepared_at"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: text("reviewed_at"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("tb_reconciliations_engagement_id_idx").on(table.engagementId),
    index("tb_reconciliations_tb_import_id_idx").on(table.tbImportId),
  ],
);
