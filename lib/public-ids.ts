import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { RequestSecurityError } from "@/lib/file-security";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PublicEntity =
  | "user"
  | "client"
  | "engagement"
  | "task"
  | "procedure"
  | "request"
  | "comment"
  | "thread"
  | "message"
  | "reviewNote"
  | "document"
  | "permanentDocument"
  | "workpaperVersion"
  | "signoff"
  | "trustee"
  | "clientUser"
  | "concern"
  | "concernEvent"
  | "fileLockEvent"
  | "tbImport"
  | "tbAccount"
  | "tbAnalytic"
  | "tbReconciliation";

function publicId(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID.test(value))
    throw new RequestSecurityError(`${field} must be an opaque UUID`, 400);
  return value.toLowerCase();
}

/** Resolve an external UUID to a private database key, always within one tenant. */
export async function resolvePublicId(
  tenantId: string,
  entity: PublicEntity,
  value: unknown,
  field = `${entity}Id`,
): Promise<number> {
  const id = publicId(value, field);
  const tables = {
    user: s.users, client: s.clients, engagement: s.engagements, task: s.tasks,
    procedure: s.procedures, request: s.evidenceRequests, comment: s.comments,
    thread: s.conversationThreads, message: s.conversationMessages,
    reviewNote: s.reviewNotes, document: s.documents, permanentDocument: s.permanentDocuments,
    workpaperVersion: s.workpaperVersions, signoff: s.signoffs, trustee: s.trustees,
    clientUser: s.clientUsers, concern: s.concerns, concernEvent: s.concernEvents,
    fileLockEvent: s.fileLockEvents, tbImport: s.tbImports, tbAccount: s.tbAccounts,
    tbAnalytic: s.tbAnalytics, tbReconciliation: s.tbReconciliations,
  };
  const found = await getDb().get<{ id: number }>(
    sql`SELECT id FROM ${tables[entity]} WHERE public_id = ${id} AND tenant_id = ${tenantId} LIMIT 1`,
  );
  const internal = found?.id;
  if (!internal) throw new RequestSecurityError(`${field} was not found`, 404);
  return internal;
}

export async function resolveOptionalPublicId(
  tenantId: string,
  entity: PublicEntity,
  value: unknown,
  field?: string,
): Promise<number | null> {
  return value === undefined || value === null || value === ""
    ? null
    : resolvePublicId(tenantId, entity, value, field);
}

const auditEntityTypes: Record<string, PublicEntity> = {
  user: "user", client: "client", engagement: "engagement", task: "task",
  procedure: "procedure", evidence_request: "request", request: "request",
  comment: "comment", conversation_thread: "thread", conversation_message: "message",
  review_note: "reviewNote", document: "document", permanent_document: "permanentDocument",
  workpaper_version: "workpaperVersion", signoff: "signoff", trustee: "trustee",
  client_user: "clientUser", concern: "concern", concern_event: "concernEvent",
  file_lock_event: "fileLockEvent", tb_import: "tbImport", tb_account: "tbAccount",
  tb_analytic: "tbAnalytic", tb_reconciliation: "tbReconciliation",
};

async function publicIdForInternal(tenantId: string, entity: PublicEntity, value: unknown) {
  if (value === null || value === undefined || value === "") return value;
  if (typeof value === "string" && UUID.test(value)) return value.toLowerCase();
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 1) return value;
  const tables = {
    user: s.users, client: s.clients, engagement: s.engagements, task: s.tasks,
    procedure: s.procedures, request: s.evidenceRequests, comment: s.comments,
    thread: s.conversationThreads, message: s.conversationMessages,
    reviewNote: s.reviewNotes, document: s.documents, permanentDocument: s.permanentDocuments,
    workpaperVersion: s.workpaperVersions, signoff: s.signoffs, trustee: s.trustees,
    clientUser: s.clientUsers, concern: s.concerns, concernEvent: s.concernEvents,
    fileLockEvent: s.fileLockEvents, tbImport: s.tbImports, tbAccount: s.tbAccounts,
    tbAnalytic: s.tbAnalytics, tbReconciliation: s.tbReconciliations,
  };
  const found = await getDb().get<{ publicId: string }>(
    sql`SELECT public_id AS publicId FROM ${tables[entity]} WHERE id = ${numeric} AND tenant_id = ${tenantId} LIMIT 1`,
  );
  return found?.publicId ?? value;
}

export async function externaliseAuditPayload(
  tenantId: string,
  entityType: string,
  entityId: string,
  detail: unknown,
) {
  const entity = auditEntityTypes[entityType];
  const publicEntityId = entity
    ? String(await publicIdForInternal(tenantId, entity, entityId))
    : entityId;
  if (!detail || typeof detail !== "object" || Array.isArray(detail))
    return { entityId: publicEntityId, detail };
  const external = { ...(detail as Record<string, unknown>) };
  for (const [field, mappedEntity] of Object.entries(bodyIdFields)) {
    if (Object.prototype.hasOwnProperty.call(external, field))
      external[field] = await publicIdForInternal(tenantId, mappedEntity, external[field]);
  }
  if (Array.isArray(external.attachmentIds))
    external.attachmentIds = await Promise.all(external.attachmentIds.map((value) => publicIdForInternal(tenantId, "document", value)));
  return { entityId: publicEntityId, detail: external };
}

const bodyIdFields: Record<string, PublicEntity> = {
  userId: "user",
  clientId: "client",
  engagementId: "engagement",
  taskId: "task",
  procedureId: "procedure",
  requestId: "request",
  commentId: "comment",
  threadId: "thread",
  conversationThreadId: "thread",
  messageId: "message",
  replyToMessageId: "message",
  noteId: "reviewNote",
  documentId: "document",
  permanentDocumentId: "permanentDocument",
  versionId: "workpaperVersion",
  signoffId: "signoff",
  trusteeId: "trustee",
  clientUserId: "clientUser",
  concernId: "concern",
  concernEventId: "concernEvent",
  lockEventId: "fileLockEvent",
  tbImportId: "tbImport",
  accountId: "tbAccount",
  analyticId: "tbAnalytic",
  reconciliationId: "tbReconciliation",
};

/** Translate a request DTO to private keys only after validating every supplied ID. */
export async function resolvePublicBodyIds(
  tenantId: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const resolved = { ...body };
  for (const [field, entity] of Object.entries(bodyIdFields)) {
    if (Object.prototype.hasOwnProperty.call(body, field))
      resolved[field] = await resolveOptionalPublicId(tenantId, entity, body[field], field);
  }
  if (Object.prototype.hasOwnProperty.call(body, "attachmentIds")) {
    if (!Array.isArray(body.attachmentIds))
      throw new RequestSecurityError("attachmentIds must be an array", 400);
    resolved.attachmentIds = await Promise.all(
      body.attachmentIds.map((value) => resolvePublicId(tenantId, "document", value, "attachmentIds")),
    );
  }
  return resolved;
}

type Row = Record<string, unknown> & { id: number; publicId: string };
const byId = (rows: Row[]) => new Map(rows.map((row) => [row.id, row.publicId]));
const id = (map: Map<number, string>, value: unknown) =>
  value === null || value === undefined ? null : map.get(Number(value)) ?? null;
const row = (value: Row, fields: Record<string, Map<number, string>>) => {
  const result: Record<string, unknown> = { ...value, id: value.publicId };
  for (const [field, map] of Object.entries(fields)) result[field] = id(map, value[field]);
  return result;
};

/** Remove private integer keys from the browser-facing application state graph. */
export function externaliseState(
  input: Record<string, unknown>,
  catalog: Record<string, unknown> = input,
): Record<string, unknown> {
  const rows = (name: string) => (catalog[name] as Row[] | undefined) ?? [];
  const outputRows = (name: string) => (input[name] as Row[] | undefined) ?? [];
  const maps = {
    clients: byId(rows("clients")), engagements: byId(rows("engagements")), tasks: byId(rows("tasks")),
    procedures: byId(rows("procedures")), requests: byId(rows("requests")), comments: byId(rows("comments")),
    conversations: byId(rows("conversations")), messages: byId(rows("conversationMessages")), concerns: byId(rows("concerns")),
    users: byId(rows("users")), documents: byId(rows("documents")), imports: byId(rows("tbImports")), accounts: byId(rows("tbAccounts")),
    notes: byId(rows("notes")), permanentDocuments: byId(rows("permanentDocuments")),
    versions: byId(rows("versions")), signoffs: byId(rows("signoffs")), trustees: byId(rows("trustees")),
    clientUsers: byId(rows("clientUsers")), concernEvents: byId(rows("concernEvents")),
    lockEvents: byId(rows("lockEvents")), analytics: byId(rows("tbAnalytics")),
    reconciliations: byId(rows("tbReconciliations")),
  };
  const convert = (name: string, fields: Record<string, Map<number, string>> = {}) => outputRows(name).map((item) => row(item, fields));
  const actor = input.actor as Record<string, unknown>;
  const clientIds = ((actor.clientIds as number[] | undefined) ?? []).map((value) => maps.clients.get(value)).filter(Boolean);
  const clientRoles = Object.fromEntries(Object.entries((actor.clientRoles as Record<string, string> | undefined) ?? {}).flatMap(([key, value]) => {
    const external = maps.clients.get(Number(key)); return external ? [[external, value]] : [];
  }));
  const auditMaps: Record<string, Map<number, string>> = {
    user: maps.users, client: maps.clients, engagement: maps.engagements, task: maps.tasks,
    procedure: maps.procedures, evidence_request: maps.requests, request: maps.requests,
    comment: maps.comments, conversation_thread: maps.conversations, conversation_message: maps.messages,
    review_note: maps.notes, document: maps.documents, permanent_document: maps.permanentDocuments,
    workpaper_version: maps.versions, signoff: maps.signoffs, trustee: maps.trustees,
    client_user: maps.clientUsers, concern: maps.concerns, concern_event: maps.concernEvents,
    file_lock_event: maps.lockEvents, tb_import: maps.imports, tb_account: maps.accounts,
    tb_analytic: maps.analytics, tb_reconciliation: maps.reconciliations,
  };
  const audits = outputRows("audit").map((item) => {
    const result = row(item, { engagementId: maps.engagements });
    const entityMap = auditMaps[String(item.entityType)];
    const internal = Number(item.entityId);
    if (entityMap && Number.isSafeInteger(internal) && entityMap.has(internal))
      result.entityId = entityMap.get(internal);
    return result;
  });
  return {
    ...input,
    actor: { ...actor, clientIds, clientRoles },
    clients: convert("clients"),
    engagements: convert("engagements", { clientId: maps.clients }),
    tasks: convert("tasks", { engagementId: maps.engagements }),
    procedures: convert("procedures", { taskId: maps.tasks }),
    requests: convert("requests", { engagementId: maps.engagements, taskId: maps.tasks, procedureId: maps.procedures }),
    comments: convert("comments", { engagementId: maps.engagements, taskId: maps.tasks, requestId: maps.requests }),
    conversations: convert("conversations", { engagementId: maps.engagements, requestId: maps.requests }),
    conversationParticipants: convert("conversationParticipants", { threadId: maps.conversations }),
    conversationMessages: convert("conversationMessages", { threadId: maps.conversations, replyToMessageId: maps.messages }),
    notes: convert("notes", { engagementId: maps.engagements, taskId: maps.tasks }),
    documents: convert("documents", { engagementId: maps.engagements, requestId: maps.requests, taskId: maps.tasks, procedureId: maps.procedures, concernId: maps.concerns, conversationThreadId: maps.conversations, conversationMessageId: maps.messages }),
    permanentDocuments: convert("permanentDocuments", { clientId: maps.clients }),
    audit: audits, users: convert("users"),
    versions: convert("versions", { taskId: maps.tasks }),
    signoffs: convert("signoffs", { engagementId: maps.engagements, taskId: maps.tasks, procedureId: maps.procedures }),
    trustees: convert("trustees", { clientId: maps.clients }), clientUsers: convert("clientUsers", { clientId: maps.clients }),
    concerns: convert("concerns", { engagementId: maps.engagements, taskId: maps.tasks, procedureId: maps.procedures }),
    concernEvents: convert("concernEvents", { concernId: maps.concerns, engagementId: maps.engagements }),
    lockEvents: convert("lockEvents", { engagementId: maps.engagements }),
    tbImports: convert("tbImports", { engagementId: maps.engagements, documentId: maps.documents }),
    tbAccounts: convert("tbAccounts", { tbImportId: maps.imports }),
    tbAnalytics: convert("tbAnalytics", { engagementId: maps.engagements, tbImportId: maps.imports, accountId: maps.accounts, linkedTaskId: maps.tasks, linkedProcedureId: maps.procedures, concernId: maps.concerns }),
    tbReconciliations: convert("tbReconciliations", { engagementId: maps.engagements, tbImportId: maps.imports }),
    portalProgress: ((input.portalProgress as Record<string, unknown>[] | undefined) ?? []).map((item) => ({ ...item, engagementId: id(maps.engagements, item.engagementId) })),
  };
}
