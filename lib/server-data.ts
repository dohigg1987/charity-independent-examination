import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import { directions } from "@/lib/work-programme";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  AccessDeniedError,
  AuthenticationRequiredError,
  type Principal,
  normaliseRole,
} from "@/lib/authz";
import { assessConfiguredEligibility } from "@/lib/eligibility";

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
  const db = getDb();
  const internal = (
    await db
      .select()
      .from(s.users)
      .where(and(eq(s.users.email, email), eq(s.users.status, "ACTIVE")))
      .limit(1)
  )[0];
  const internalRole = internal ? normaliseRole(internal.role) : null;
  if (
    internal &&
    internalRole &&
    ["ADMIN", "INDEPENDENT_EXAMINER", "REVIEWER", "PREPARER"].includes(
      internalRole,
    )
  ) {
    return {
      kind: "INTERNAL",
      name: internal.name,
      email,
      role: internalRole,
      clientIds: [],
      clientRoles: {},
    };
  }
  const memberships = await db
    .select()
    .from(s.clientUsers)
    .where(
      and(eq(s.clientUsers.email, email), eq(s.clientUsers.status, "ACTIVE")),
    );
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

export async function seedIfEmpty() {
  if (process.env.NODE_ENV === "production") return;
  const db = getDb();
  const existing = await db
    .select({ id: s.clients.id })
    .from(s.clients)
    .limit(1);
  if (existing.length) return;
  const insertedClients = await db
    .insert(s.clients)
    .values([
      {
        name: "Willow Community Foundation",
        charityNumber: "1187421",
        legalForm: "CIO",
        contactName: "Sarah Whitfield",
        contactEmail: "sarah@willow.example",
      },
      {
        name: "Harbour Youth Trust",
        charityNumber: "1162089",
        legalForm: "Charitable company",
        contactName: "James Okoro",
        contactEmail: "james@harbour.example",
      },
      {
        name: "Oakfield Arts Collective",
        charityNumber: "1200194",
        legalForm: "CIO",
        contactName: "Amelia Rhodes",
        contactEmail: "amelia@oakfield.example",
      },
      {
        name: "Beacon Wellbeing CIO",
        charityNumber: "1193450",
        legalForm: "CIO",
        contactName: "Mina Shah",
        contactEmail: "mina@beacon.example",
      },
    ])
    .returning();
  await db.insert(s.users).values([
    {
      email: "preview@clarity.ie",
      name: "Dennis O'Higgins",
      role: "INDEPENDENT_EXAMINER",
      status: "ACTIVE",
    },
    {
      email: "joanne@clarity.ie",
      name: "Joanne Mercer",
      role: "REVIEWER",
      status: "ACTIVE",
    },
  ]);
  const willow = insertedClients[0];
  const insertedEngagements = await db
    .insert(s.engagements)
    .values([
      {
        clientId: willow.id,
        periodEnd: "2026-03-31",
        accountingBasis: "Accruals",
        grossIncome: 612400,
        grossAssets: 1482000,
        materiality: 12250,
        risk: "STANDARD",
        status: "FIELDWORK",
      },
      {
        clientId: insertedClients[1].id,
        periodEnd: "2026-04-30",
        accountingBasis: "Accruals",
        grossIncome: 342800,
        grossAssets: 890000,
        materiality: 6860,
        risk: "LOW",
        status: "REVIEW",
        trusteeApproved: true,
        materialSignificanceAssessed: true,
      },
      {
        clientId: insertedClients[2].id,
        periodEnd: "2026-05-31",
        accountingBasis: "Receipts and payments",
        grossIncome: 178900,
        grossAssets: 410000,
        materiality: 3580,
        risk: "STANDARD",
        status: "PLANNING",
      },
      {
        clientId: insertedClients[3].id,
        periodEnd: "2026-06-30",
        accountingBasis: "Accruals",
        grossIncome: 426000,
        grossAssets: 920000,
        materiality: 8520,
        risk: "HIGH",
        status: "CLIENT_INPUT",
      },
    ])
    .returning();
  const eng = insertedEngagements[0];
  const insertedTasks = await db
    .insert(s.tasks)
    .values(
      directions.map((d, index) => ({
        engagementId: eng.id,
        direction: d.id,
        title: d.title,
        objective: d.objective,
        phase: d.phase,
        guidance: `Applies to: ${d.applies}. Document the work performed, evidence obtained, significant judgements and conclusion in sufficient detail to support the independent examination.`,
        status:
          index < 4
            ? "REVIEWED"
            : index < 6
              ? "PREPARED"
              : index < 10
                ? "IN_PROGRESS"
                : "NOT_STARTED",
        conclusion:
          index < 6
            ? `Direction ${d.id} procedures completed with no material exception, subject to the matters recorded in the workpaper.`
            : "",
      })),
    )
    .returning();
  for (const task of insertedTasks) {
    const direction = directions.find((d) => d.id === task.direction)!;
    await db.insert(s.procedures).values(
      direction.procedures.map((text, index) => ({
        taskId: task.id,
        sequence: index + 1,
        text,
        completed: task.direction < 6 || (task.direction === 6 && index < 2),
        completedBy: task.direction < 7 ? "Dennis O'Higgins" : null,
        completedAt: task.direction < 7 ? "2026-08-14T16:42:00Z" : null,
      })),
    );
  }
  const seededProcedures = await db.select().from(s.procedures);
  const seededRequests = await db.insert(s.evidenceRequests).values([
    {
      engagementId: eng.id,
      taskId: insertedTasks[7].id,
      procedureId: seededProcedures.find(
        (p) => p.taskId === insertedTasks[7].id,
      )?.id,
      reference: "REQ-018",
      title: "Restricted funds reconciliation",
      description:
        "Provide the year-end restricted funds reconciliation, including brought-forward balances, income, expenditure, transfers and closing balances.",
      contactName: "Sarah Whitfield",
      contactEmail: "sarah@willow.example",
      dueDate: "2026-08-18",
      status: "AWAITING_CLIENT",
    },
    {
      engagementId: eng.id,
      taskId: insertedTasks[6].id,
      procedureId: seededProcedures.find(
        (p) => p.taskId === insertedTasks[6].id,
      )?.id,
      reference: "REQ-017",
      title: "Trustee declarations and interests",
      description:
        "Provide completed declarations of interests for every trustee serving during the year.",
      contactName: "Sarah Whitfield",
      contactEmail: "sarah@willow.example",
      dueDate: "2026-08-14",
      status: "OVERDUE",
    },
    {
      engagementId: eng.id,
      taskId: insertedTasks[5].id,
      procedureId: seededProcedures.find(
        (p) => p.taskId === insertedTasks[5].id,
      )?.id,
      reference: "REQ-016",
      title: "July bank statement and reconciliation",
      description:
        "Provide the July bank statement and reconciliation supporting the March timing difference.",
      contactName: "Sarah Whitfield",
      contactEmail: "sarah@willow.example",
      dueDate: "2026-08-20",
      status: "RECEIVED",
      receivedAt: "2026-08-14T10:06:00Z",
    },
  ]).returning();
  const now = new Date().toISOString();
  for (const request of seededRequests) {
    const [thread] = await db.insert(s.conversationThreads).values({
      engagementId: eng.id,
      requestId: request.id,
      subject: request.title,
      category: "EVIDENCE",
      priority: request.status === "OVERDUE" ? "HIGH" : "NORMAL",
      status: request.status === "RECEIVED" ? "RESOLVED" : "WAITING_CLIENT",
      assignedTo: "preview@clarity.ie",
      createdBy: "preview@clarity.ie",
      lastMessageAt: now,
      resolvedAt: request.status === "RECEIVED" ? request.receivedAt : null,
      resolvedBy: request.status === "RECEIVED" ? "preview@clarity.ie" : null,
    }).returning();
    await db.insert(s.conversationParticipants).values([
      {
        threadId: thread.id,
        email: "preview@clarity.ie",
        name: "Dennis O'Higgins",
        participantType: "PRACTICE",
        lastReadAt: now,
      },
      {
        threadId: thread.id,
        email: request.contactEmail,
        name: request.contactName,
        participantType: "CLIENT",
      },
    ]);
    await db.insert(s.conversationMessages).values({
      threadId: thread.id,
      authorEmail: "preview@clarity.ie",
      authorName: "Dennis O'Higgins",
      authorType: "PRACTICE",
      body: request.description,
      createdAt: now,
    });
  }
  const [generalThread] = await db.insert(s.conversationThreads).values({
    engagementId: eng.id,
    subject: "Year-end accounts and trustee approval timetable",
    category: "REPORTING",
    priority: "NORMAL",
    status: "WAITING_PRACTICE",
    assignedTo: "preview@clarity.ie",
    createdBy: "sarah@willow.example",
    lastMessageAt: "2026-08-15T14:22:00Z",
  }).returning();
  await db.insert(s.conversationParticipants).values([
    {
      threadId: generalThread.id,
      email: "preview@clarity.ie",
      name: "Dennis O'Higgins",
      participantType: "PRACTICE",
      lastReadAt: "2026-08-15T13:00:00Z",
    },
    {
      threadId: generalThread.id,
      email: "sarah@willow.example",
      name: "Sarah Whitfield",
      participantType: "CLIENT",
      lastReadAt: "2026-08-15T14:22:00Z",
    },
  ]);
  await db.insert(s.conversationMessages).values([
    {
      threadId: generalThread.id,
      authorEmail: "preview@clarity.ie",
      authorName: "Dennis O'Higgins",
      authorType: "PRACTICE",
      body: "The draft accounts are scheduled for final review this week. Please confirm the date of the trustees' approval meeting so the completion timetable can be aligned.",
      createdAt: "2026-08-15T11:06:00Z",
    },
    {
      threadId: generalThread.id,
      authorEmail: "sarah@willow.example",
      authorName: "Sarah Whitfield",
      authorType: "CLIENT",
      body: "The trustees are meeting on 26 August. Can the final draft and representation points be available by 22 August for circulation?",
      createdAt: "2026-08-15T14:22:00Z",
    },
  ]);
  await db.insert(s.comments).values([
    {
      engagementId: eng.id,
      taskId: insertedTasks[5].id,
      authorEmail: "joanne@clarity.ie",
      authorName: "Joanne Mercer",
      body: "Please reconcile the £1,240 variance to the post year-end bank statement and cross-reference the evidence.",
    },
    {
      engagementId: eng.id,
      taskId: insertedTasks[5].id,
      authorEmail: "dennis@clarity.ie",
      authorName: "Dennis O'Higgins",
      body: "Request raised with Sarah. The statement is due on 20 August.",
    },
  ]);
  await db.insert(s.reviewNotes).values([
    {
      engagementId: eng.id,
      taskId: insertedTasks[1].id,
      reference: "WP 2.1",
      title: "Independence declaration",
      body: "Document whether prior bookkeeping support creates a self-review threat.",
      severity: "HIGH",
      raisedBy: "Joanne Mercer",
    },
    {
      engagementId: eng.id,
      taskId: insertedTasks[5].id,
      reference: "WP 6.2",
      title: "Bank reconciliation difference",
      body: "Obtain and cross-reference the post year-end statement.",
      severity: "MEDIUM",
      raisedBy: "Joanne Mercer",
    },
    {
      engagementId: eng.id,
      taskId: insertedTasks[10].id,
      reference: "WP 11.3",
      title: "Payroll variance",
      body: "Expand the analytical expectation to reflect the April pay award.",
      severity: "LOW",
      raisedBy: "Joanne Mercer",
    },
  ]);
  await audit(
    eng.id,
    "system@clarity.ie",
    "ENGAGEMENT_SEEDED",
    "engagement",
    String(eng.id),
    {},
  );
}

export async function audit(
  engagementId: number | null,
  actorEmail: string,
  action: string,
  entityType: string,
  entityId: string,
  detail: unknown,
) {
  const db = getDb();
  const previous =
    (
      await db
        .select({ eventHash: s.auditEvents.eventHash })
        .from(s.auditEvents)
        .orderBy(desc(s.auditEvents.id))
        .limit(1)
    )[0]?.eventHash ?? null;
  const createdAt = new Date().toISOString();
  const serialised = JSON.stringify(detail);
  const eventHash = await snapshotHash({
    previous,
    engagementId,
    actorEmail,
    action,
    entityType,
    entityId,
    detail: serialised,
    createdAt,
  });
  await db.insert(s.auditEvents).values({
    engagementId,
    actorEmail,
    action,
    entityType,
    entityId,
    detail: serialised,
    previousHash: previous,
    eventHash,
    createdAt,
  });
}

export async function getState(principal?: Principal) {
  await seedIfEmpty();
  const db = getDb();
  const currentActor = principal ?? (await actor());
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
  ] = await Promise.all([
    db.select().from(s.clients),
    db
      .select({
        id: s.engagements.id,
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
      })
      .from(s.engagements)
      .innerJoin(s.clients, eq(s.engagements.clientId, s.clients.id)),
    db.select().from(s.tasks),
    db.select().from(s.procedures),
    db.select().from(s.evidenceRequests),
    db.select().from(s.comments).orderBy(desc(s.comments.createdAt)),
    db.select().from(s.conversationThreads).orderBy(desc(s.conversationThreads.lastMessageAt)),
    db.select().from(s.conversationParticipants),
    db.select().from(s.conversationMessages).orderBy(s.conversationMessages.createdAt),
    db.select().from(s.reviewNotes).orderBy(desc(s.reviewNotes.createdAt)),
    db
      .select({
        id: s.documents.id,
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
      .orderBy(desc(s.documents.createdAt)),
    db
      .select({
        id: s.permanentDocuments.id,
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
      .orderBy(desc(s.permanentDocuments.createdAt)),
    db
      .select()
      .from(s.auditEvents)
      .orderBy(desc(s.auditEvents.createdAt))
      .limit(100),
    db.select().from(s.users),
    db
      .select()
      .from(s.workpaperVersions)
      .orderBy(desc(s.workpaperVersions.createdAt)),
    db.select().from(s.signoffs).orderBy(desc(s.signoffs.signedAt)),
    db.select().from(s.trustees),
    db.select().from(s.clientUsers),
    db.select().from(s.concerns).orderBy(desc(s.concerns.createdAt)),
    db.select().from(s.concernEvents).orderBy(desc(s.concernEvents.createdAt)),
    db
      .select()
      .from(s.fileLockEvents)
      .orderBy(desc(s.fileLockEvents.createdAt)),
    db.select().from(s.tbImports).orderBy(desc(s.tbImports.createdAt)),
    db.select().from(s.tbAccounts),
    db.select().from(s.tbAnalytics).orderBy(desc(s.tbAnalytics.createdAt)),
    db.select().from(s.tbReconciliations),
    db.select().from(s.jurisdictions).orderBy(s.jurisdictions.name),
    db
      .select()
      .from(s.jurisdictionRuleSets)
      .orderBy(desc(s.jurisdictionRuleSets.effectiveFrom)),
    db.select().from(s.organisationTypes).orderBy(s.organisationTypes.name),
    db.select().from(s.practiceSettings).limit(1),
  ]);
  const practiceSettings = practiceSettingsRows[0] ?? {
    id: 1,
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
  if (currentActor.kind === "INTERNAL")
    return {
      actor: currentActor,
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
    };
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
  return {
    actor: currentActor,
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
          conversations.some(
            (thread) =>
              thread.id === row.conversationThreadId &&
              engagementIds.has(thread.engagementId),
          )),
    ),
    permanentDocuments: [],
    audit: [],
    users: [],
    versions: [],
    signoffs: [],
    trustees: [],
    clientUsers: [],
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
  };
}

export async function snapshotHash(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
