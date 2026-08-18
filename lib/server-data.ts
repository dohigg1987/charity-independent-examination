import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { externaliseAuditPayload, externaliseState } from "@/lib/public-ids";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  AccessDeniedError,
  AuthenticationRequiredError,
  type Principal,
  normaliseRole,
} from "@/lib/authz";
import { assessConfiguredEligibility } from "@/lib/eligibility";
import {
  DEVELOPMENT_TENANT_ID,
  resolveClientMemberships,
  resolveInternalMembership,
} from "@/lib/tenancy";

export async function applicableRuleSet(
  jurisdictionCode: string,
  periodEnd: string,
  periodStart?: string | null,
) {
  const db = getDb();
  const jurisdiction = (
    await db
      .select()
      .from(s.jurisdictions)
      .where(eq(s.jurisdictions.code, jurisdictionCode))
      .limit(1)
  )[0];
  if (!jurisdiction || jurisdiction.status !== "ACTIVE")
    throw new Error("The selected jurisdiction is not active");
  const rules = await db
    .select()
    .from(s.jurisdictionRuleSets)
    .where(eq(s.jurisdictionRuleSets.jurisdictionId, jurisdiction.id));
  const rule = rules
    .filter(
      (row) => {
        const applicableDate =
          row.effectiveDateBasis === "PERIOD_START"
            ? (periodStart ?? periodEnd)
            : periodEnd;
        return (
          row.status === "PUBLISHED" &&
          row.effectiveFrom <= applicableDate &&
          (!row.effectiveTo || row.effectiveTo >= applicableDate)
        );
      },
    )
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  if (!rule)
    throw new Error(
      `No published ${jurisdiction.name} rule set covers ${periodEnd}`,
    );
  return { jurisdiction, rule };
}

export async function engagementEligibility(engagement: {
  jurisdiction: string;
  jurisdictionRuleSetId?: number | null;
  periodEnd: string;
  periodStart?: string | null;
  grossIncome: number;
  grossAssets: number;
  accountingBasis: string;
  governingDocumentAudit?: boolean;
  funderAudit?: boolean;
  commissionAudit?: boolean;
  groupAccountsRequired?: boolean;
}) {
  const db = getDb();
  let resolved: Awaited<ReturnType<typeof applicableRuleSet>>;
  if (engagement.jurisdictionRuleSetId) {
    const rule = (
      await db
        .select()
        .from(s.jurisdictionRuleSets)
        .where(eq(s.jurisdictionRuleSets.id, engagement.jurisdictionRuleSetId))
        .limit(1)
    )[0];
    const jurisdiction = rule
      ? (
          await db
            .select()
            .from(s.jurisdictions)
            .where(eq(s.jurisdictions.id, rule.jurisdictionId))
            .limit(1)
        )[0]
      : undefined;
    resolved = rule && jurisdiction ? { rule, jurisdiction } : await applicableRuleSet(engagement.jurisdiction, engagement.periodEnd, engagement.periodStart);
  } else {
    resolved = await applicableRuleSet(engagement.jurisdiction, engagement.periodEnd, engagement.periodStart);
  }
  return assessConfiguredEligibility(
    engagement.periodEnd,
    engagement.grossIncome,
    engagement.grossAssets,
    {
      ...resolved.rule,
      assetTestBasis: resolved.rule.assetTestBasis as
        | "INCOME_AND_ASSETS"
        | "ACCRUALS_ASSETS"
        | "NONE",
      effectiveDateBasis: resolved.rule.effectiveDateBasis as
        | "PERIOD_START"
        | "PERIOD_END",
      jurisdictionName: resolved.jurisdiction.name,
      accountingBasis: engagement.accountingBasis,
      periodStart: engagement.periodStart,
    },
    engagement,
  );
}

export async function actor(): Promise<Principal> {
  const user = await getChatGPTUser();
  if (!user) {
    if (process.env.NODE_ENV !== "production") {
      return {
        tenantId: DEVELOPMENT_TENANT_ID,
        kind: "INTERNAL",
        name: "Dennis O'Higgins",
        email: "preview@clarity.ie",
        role: "ADMIN",
        clientIds: [],
        clientRoles: {},
      };
    }
    throw new AuthenticationRequiredError();
  }
  const email = user.email.trim().toLowerCase();
  const internal = await resolveInternalMembership(email);
  const internalRole = internal ? normaliseRole(internal.role) : null;
  if (
    internal &&
    internalRole &&
    ["ADMIN", "INDEPENDENT_EXAMINER", "REVIEWER", "PREPARER"].includes(
      internalRole,
    )
  ) {
    return {
      tenantId: internal.tenantId,
      kind: "INTERNAL",
      name: internal.name,
      email,
      role: internalRole,
      clientIds: [],
      clientRoles: {},
    };
  }
  const memberships = await resolveClientMemberships(email);
  if (memberships.length) {
    const roles = memberships.map((membership) => ({
      clientId: membership.clientId,
      role: normaliseRole(membership.role),
    }));
    if (
      roles.some(
        ({ role }) =>
          !role || !["PORTAL_ADMIN", "CONTRIBUTOR", "READ_ONLY"].includes(role),
      )
    )
      throw new AccessDeniedError("Client role is invalid");
    const clientRoles = Object.fromEntries(
      roles.map(({ clientId, role }) => [clientId, role]),
    ) as Principal["clientRoles"];
    const role = clientRoles[memberships[0].clientId]!;
    return {
      tenantId: memberships[0].tenantId,
      kind: "CLIENT",
      name: memberships[0].name || user.displayName,
      email,
      role,
      clientIds: [...new Set(memberships.map((row) => row.clientId))],
      clientRoles,
    };
  }
  throw new AccessDeniedError(
    "This account has not been authorised for Clarity IE",
  );
}

export async function prepareAuditInsert(
  tenantId: string,
  engagementId: number | null,
  actorEmail: string,
  action: string,
  entityType: string,
  entityId: string,
  detail: unknown,
) {
  const db = getDb();
  if (engagementId) {
    const engagement = (
      await db
        .select({ id: s.engagements.id })
        .from(s.engagements)
        .where(
          and(
            eq(s.engagements.id, engagementId),
            eq(s.engagements.tenantId, tenantId),
          ),
        )
        .limit(1)
    )[0];
    if (!engagement)
      throw new AccessDeniedError("The audited record is outside this tenant");
  }
  const previous =
    (
      await db
        .select({ eventHash: s.auditHeads.lastHash })
        .from(s.auditHeads)
        .where(eq(s.auditHeads.tenantId, tenantId))
        .limit(1)
    )[0]?.eventHash ?? null;
  const createdAt = new Date().toISOString();
  const external = await externaliseAuditPayload(
    tenantId,
    entityType,
    entityId,
    detail,
  );
  const serialised = JSON.stringify(external.detail);
  const eventHash = await snapshotHash({
    previous,
    engagementId,
    actorEmail,
    action,
    entityType,
    entityId: external.entityId,
    detail: serialised,
    createdAt,
  });
  return {
    statement: db.insert(s.auditEvents).values({
      tenantId,
      engagementId,
      actorEmail,
      action,
      entityType,
      entityId: external.entityId,
      detail: serialised,
      previousHash: previous,
      eventHash,
      createdAt,
    }),
  };
}

export async function audit(
  engagementId: number | null,
  actorEmail: string,
  action: string,
  entityType: string,
  entityId: string,
  detail: unknown,
) {
  const internalMembership = await resolveInternalMembership(actorEmail);
  const clientMemberships = internalMembership
    ? []
    : await resolveClientMemberships(actorEmail);
  const actorTenant =
    internalMembership?.tenantId ?? clientMemberships[0]?.tenantId;
  if (!actorTenant)
    throw new AccessDeniedError("An auditable tenant context is required");
  const { statement } = await prepareAuditInsert(
    actorTenant,
    engagementId,
    actorEmail,
    action,
    entityType,
    entityId,
    detail,
  );
  await statement;
}

export async function getState(principal?: Principal) {
  const db = getDb();
  const currentActor = principal ?? (await actor());
  const tenantId = currentActor.tenantId;
  const [
    clients,
    engagementRows,
    tasks,
    procedures,
    requestRows,
    comments,
    conversations,
    conversationParticipants,
    conversationMessages,
    notes,
    documents,
    permanentDocuments,
    auditRows,
    users,
    versions,
    signoffs,
    trustees,
    clientUsers,
    clientContacts,
    clientActivities,
    concerns,
    concernEvents,
    lockEvents,
    tbImports,
    tbAccounts,
    tbAnalytics,
    tbReconciliations,
    jurisdictions,
    jurisdictionRuleSets,
    organisationTypes,
    practiceSettingsRows,
    tenantRows,
  ] = await Promise.all([
    db.select().from(s.clients).where(eq(s.clients.tenantId, tenantId)),
    db
      .select({
        id: s.engagements.id,
        publicId: s.engagements.publicId,
        clientId: s.engagements.clientId,
        clientName: s.clients.name,
        charityNumber: s.clients.charityNumber,
        periodEnd: s.engagements.periodEnd,
        periodStart: s.engagements.periodStart,
        accountingBasis: s.engagements.accountingBasis,
        grossIncome: s.engagements.grossIncome,
        grossAssets: s.engagements.grossAssets,
        materiality: s.engagements.materiality,
        risk: s.engagements.risk,
        status: s.engagements.status,
        jurisdiction: s.engagements.jurisdiction,
        jurisdictionRuleSetId: s.engagements.jurisdictionRuleSetId,
        fundProfile: s.engagements.fundProfile,
        complexity: s.engagements.complexity,
        governingDocumentAudit: s.engagements.governingDocumentAudit,
        funderAudit: s.engagements.funderAudit,
        commissionAudit: s.engagements.commissionAudit,
        groupAccountsRequired: s.engagements.groupAccountsRequired,
        scopeConclusion: s.engagements.scopeConclusion,
        methodologyVersion: s.engagements.methodologyVersion,
        qualityReviewMode: s.engagements.qualityReviewMode,
        qualityReviewStatus: s.engagements.qualityReviewStatus,
        qualityReviewConclusion: s.engagements.qualityReviewConclusion,
        qualityReviewedBy: s.engagements.qualityReviewedBy,
        qualityReviewedAt: s.engagements.qualityReviewedAt,
        trusteeApproved: s.engagements.trusteeApproved,
        materialSignificanceAssessed:
          s.engagements.materialSignificanceAssessed,
        reportConclusion: s.engagements.reportConclusion,
        lockedAt: s.engagements.lockedAt,
        lockedBy: s.engagements.lockedBy,
        reopenedAt: s.engagements.reopenedAt,
        reopenedBy: s.engagements.reopenedBy,
        reopenReason: s.engagements.reopenReason,
        rowVersion: s.engagements.rowVersion,
      })
      .from(s.engagements)
      .innerJoin(
        s.clients,
        and(
          eq(s.engagements.clientId, s.clients.id),
          eq(s.engagements.tenantId, s.clients.tenantId),
        ),
      )
      .where(eq(s.engagements.tenantId, tenantId)),
    db.select().from(s.tasks).where(eq(s.tasks.tenantId, tenantId)),
    db.select().from(s.procedures).where(eq(s.procedures.tenantId, tenantId)),
    db.select().from(s.evidenceRequests).where(eq(s.evidenceRequests.tenantId, tenantId)),
    db.select().from(s.comments).where(eq(s.comments.tenantId, tenantId)).orderBy(desc(s.comments.createdAt)),
    db.select().from(s.conversationThreads).where(eq(s.conversationThreads.tenantId, tenantId)).orderBy(desc(s.conversationThreads.lastMessageAt)),
    db.select().from(s.conversationParticipants).where(eq(s.conversationParticipants.tenantId, tenantId)),
    db.select().from(s.conversationMessages).where(eq(s.conversationMessages.tenantId, tenantId)).orderBy(s.conversationMessages.createdAt),
    db.select().from(s.reviewNotes).where(eq(s.reviewNotes.tenantId, tenantId)).orderBy(desc(s.reviewNotes.createdAt)),
    db
      .select({
        id: s.documents.id,
        publicId: s.documents.publicId,
        engagementId: s.documents.engagementId,
        requestId: s.documents.requestId,
        taskId: s.documents.taskId,
        procedureId: s.documents.procedureId,
        concernId: s.documents.concernId,
        conversationThreadId: s.documents.conversationThreadId,
        conversationMessageId: s.documents.conversationMessageId,
        fileSection: s.documents.fileSection,
        fileName: s.documents.fileName,
        mimeType: s.documents.mimeType,
        byteSize: s.documents.byteSize,
        sha256: s.documents.sha256,
        uploadedBy: s.documents.uploadedBy,
        malwareStatus: s.documents.malwareStatus,
        createdAt: s.documents.createdAt,
      })
      .from(s.documents)
      .where(eq(s.documents.tenantId, tenantId))
      .orderBy(desc(s.documents.createdAt)),
    db
      .select({
        id: s.permanentDocuments.id,
        publicId: s.permanentDocuments.publicId,
        clientId: s.permanentDocuments.clientId,
        category: s.permanentDocuments.category,
        fileName: s.permanentDocuments.fileName,
        mimeType: s.permanentDocuments.mimeType,
        byteSize: s.permanentDocuments.byteSize,
        sha256: s.permanentDocuments.sha256,
        uploadedBy: s.permanentDocuments.uploadedBy,
        status: s.permanentDocuments.status,
        createdAt: s.permanentDocuments.createdAt,
      })
      .from(s.permanentDocuments)
      .where(eq(s.permanentDocuments.tenantId, tenantId))
      .orderBy(desc(s.permanentDocuments.createdAt)),
    db
      .select()
      .from(s.auditEvents)
      .where(eq(s.auditEvents.tenantId, tenantId))
      .orderBy(desc(s.auditEvents.createdAt))
      .limit(100),
    db.select().from(s.users).where(eq(s.users.tenantId, tenantId)),
    db
      .select()
      .from(s.workpaperVersions)
      .where(eq(s.workpaperVersions.tenantId, tenantId))
      .orderBy(desc(s.workpaperVersions.createdAt)),
    db.select().from(s.signoffs).where(eq(s.signoffs.tenantId, tenantId)).orderBy(desc(s.signoffs.signedAt)),
    db.select().from(s.trustees).where(eq(s.trustees.tenantId, tenantId)),
    db.select().from(s.clientUsers).where(eq(s.clientUsers.tenantId, tenantId)),
    db.select().from(s.clientContacts).where(eq(s.clientContacts.tenantId, tenantId)).orderBy(s.clientContacts.name),
    db.select().from(s.clientActivities).where(eq(s.clientActivities.tenantId, tenantId)).orderBy(desc(s.clientActivities.occurredAt)),
    db.select().from(s.concerns).where(eq(s.concerns.tenantId, tenantId)).orderBy(desc(s.concerns.createdAt)),
    db.select().from(s.concernEvents).where(eq(s.concernEvents.tenantId, tenantId)).orderBy(desc(s.concernEvents.createdAt)),
    db
      .select()
      .from(s.fileLockEvents)
      .where(eq(s.fileLockEvents.tenantId, tenantId))
      .orderBy(desc(s.fileLockEvents.createdAt)),
    db.select().from(s.tbImports).where(eq(s.tbImports.tenantId, tenantId)).orderBy(desc(s.tbImports.createdAt)),
    db.select().from(s.tbAccounts).where(eq(s.tbAccounts.tenantId, tenantId)),
    db.select().from(s.tbAnalytics).where(eq(s.tbAnalytics.tenantId, tenantId)).orderBy(desc(s.tbAnalytics.createdAt)),
    db.select().from(s.tbReconciliations).where(eq(s.tbReconciliations.tenantId, tenantId)),
    db.select().from(s.jurisdictions).orderBy(s.jurisdictions.name),
    db
      .select()
      .from(s.jurisdictionRuleSets)
      .orderBy(desc(s.jurisdictionRuleSets.effectiveFrom)),
    db.select().from(s.organisationTypes).orderBy(s.organisationTypes.name),
    db.select().from(s.practiceSettings).where(eq(s.practiceSettings.tenantId, tenantId)).limit(1),
    db.select({ name: s.tenants.name }).from(s.tenants).where(eq(s.tenants.id, tenantId)).limit(1),
  ]);
  const practiceName = tenantRows[0]?.name ?? "Examination practice";
  const practiceSettings = practiceSettingsRows[0] ?? {
    tenantId,
    concernReviewMode: "EXAMINER_JUDGEMENT",
    requireIndependentConcernClosure: false,
    allowProcedureSelfReview: false,
    defaultQualityReviewMode: "NONE",
    fileLockDeadlineDays: 60,
    retentionYears: 7,
    updatedBy: "system",
    updatedAt: new Date(0).toISOString(),
  };
  const today = new Date().toISOString().slice(0, 10);
  const requests = requestRows.map((r) =>
    r.status === "AWAITING_CLIENT" && r.dueDate < today
      ? { ...r, status: "OVERDUE" }
      : r,
  );
  const catalog = {
    clients,
    engagements: engagementRows,
    tasks,
    procedures,
    requests,
    comments,
    conversations,
    conversationParticipants,
    conversationMessages,
    notes,
    documents,
    permanentDocuments,
    audit: auditRows,
    users,
    versions,
    signoffs,
    trustees,
    clientUsers,
    clientContacts,
    clientActivities,
    concerns,
    concernEvents,
    lockEvents,
    tbImports,
    tbAccounts,
    tbAnalytics,
    tbReconciliations,
  };
  if (currentActor.kind === "INTERNAL")
    return externaliseState({
      actor: currentActor,
      practiceName,
      clients,
      engagements: engagementRows,
      tasks,
      procedures,
      requests,
      comments,
      conversations,
      conversationParticipants,
      conversationMessages,
      notes,
      documents,
      permanentDocuments,
      audit: auditRows,
      users,
      versions,
      signoffs,
      trustees,
      clientUsers,
      clientContacts,
      clientActivities,
      concerns,
      concernEvents,
      lockEvents,
      tbImports,
      tbAccounts,
      tbAnalytics,
      tbReconciliations,
      jurisdictions,
      jurisdictionRuleSets,
      organisationTypes,
      practiceSettings,
    }, catalog);
  const allowedClients = new Set(currentActor.clientIds),
    visibleClients = clients.filter((row) => allowedClients.has(row.id)),
    visibleEngagements = engagementRows.filter((row) =>
      allowedClients.has(row.clientId),
    ),
    engagementIds = new Set(visibleEngagements.map((row) => row.id)),
    visibleTasks = tasks.filter((row) => engagementIds.has(row.engagementId)),
    visibleConversations = conversations.filter((thread) => {
      const engagement = visibleEngagements.find(
        (row) => row.id === thread.engagementId,
      );
      if (!engagement) return false;
      if (currentActor.clientRoles[engagement.clientId] === "PORTAL_ADMIN")
        return true;
      return conversationParticipants.some(
        (participant) =>
          participant.threadId === thread.id &&
          participant.email.toLowerCase() === currentActor.email.toLowerCase(),
      );
    }),
    conversationIds = new Set(visibleConversations.map((row) => row.id)),
    visibleRequests = requests.filter((row) => {
      const engagement = visibleEngagements.find(
        (item) => item.id === row.engagementId,
      );
      if (!engagement) return false;
      return (
        currentActor.clientRoles[engagement.clientId] === "PORTAL_ADMIN" ||
        row.contactEmail.toLowerCase() === currentActor.email.toLowerCase() ||
        visibleConversations.some((thread) => thread.requestId === row.id)
      );
    }),
    requestIds = new Set(visibleRequests.map((row) => row.id)),
    clientEngagements = visibleEngagements.map((row) => ({
      id: row.id,
      publicId: row.publicId,
      clientId: row.clientId,
      clientName: row.clientName,
      charityNumber: row.charityNumber,
      periodEnd: row.periodEnd,
      periodStart: row.periodStart,
      accountingBasis: row.accountingBasis,
      status: row.status,
      lockedAt: row.lockedAt,
    })),
    portalProgress = visibleEngagements.map((engagement) => {
      const engagementTasks = visibleTasks.filter(
        (task) => task.engagementId === engagement.id,
      );
      return {
        engagementId: engagement.id,
        totalTasks: engagementTasks.length,
        reviewedTasks: engagementTasks.filter(
          (task) => task.status === "REVIEWED",
        ).length,
      };
    });
  return externaliseState({
    actor: currentActor,
    practiceName,
    clients: visibleClients.map((row) => ({
      ...row,
      contactName: currentActor.name,
      contactEmail: currentActor.email,
    })),
    engagements: clientEngagements,
    portalProgress,
    tasks: [],
    procedures: [],
    requests: visibleRequests,
    comments: comments.filter(
      (row) =>
        engagementIds.has(row.engagementId) &&
        row.visibility === "CLIENT" &&
        (row.requestId === null || requestIds.has(row.requestId)),
    ),
    conversations: visibleConversations,
    conversationParticipants: conversationParticipants.filter((row) =>
      conversationIds.has(row.threadId),
    ),
    conversationMessages: conversationMessages.filter((row) =>
      conversationIds.has(row.threadId),
    ),
    notes: [],
    documents: documents.filter(
      (row) =>
        (row.requestId !== null && requestIds.has(row.requestId)) ||
        (row.conversationThreadId !== null &&
          row.conversationMessageId !== null &&
          conversationIds.has(row.conversationThreadId)),
    ),
    permanentDocuments: [],
    audit: [],
    users: [],
    versions: [],
    signoffs: [],
    trustees: [],
    clientUsers: [],
    clientContacts: [],
    clientActivities: [],
    concerns: [],
    concernEvents: [],
    lockEvents: [],
    tbImports: [],
    tbAccounts: [],
    tbAnalytics: [],
    tbReconciliations: [],
    jurisdictions: [],
    jurisdictionRuleSets: [],
    organisationTypes: [],
    practiceSettings: null,
  }, catalog);
}

export async function snapshotHash(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
