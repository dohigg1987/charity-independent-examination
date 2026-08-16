import { and, desc, eq, max } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import {
  actor,
  applicableRuleSet,
  audit,
  engagementEligibility,
  getState,
  seedIfEmpty,
  snapshotHash,
} from "@/lib/server-data";
import { programmeForJurisdiction } from "@/lib/work-programme";
import {
  concernCategories,
  conclusionCompatibility,
  reportingAssessments,
  validateConcernSubmission,
} from "@/lib/concerns";
import { planRulePublication } from "@/lib/rule-series";
import {
  canManagePractice,
  canAccessClient,
  canPrepare,
  canRespondForClient,
  canReview,
  normaliseRole,
  requirePermission,
  type Principal,
} from "@/lib/authz";
import {
  enforceRateLimit,
  enforceSameOrigin,
  requireContentType,
} from "@/lib/security";
import { errorResponse, json } from "@/lib/http";
import {
  requireEmail,
  requireIsoDate,
  requireNonNegativeNumber,
  requireOneOf,
  validatePayload,
} from "@/lib/validation";
import {
  CONVERSATION_CATEGORIES,
  CONVERSATION_PRIORITIES,
  CONVERSATION_STATUSES,
  conversationTransitionIssue,
  statusAfterMessage,
  type ConversationStatus,
} from "@/lib/communications";

export const dynamic = "force-dynamic";
async function requireOpen(engagementId: number) {
  const row = (
    await getDb()
      .select()
      .from(s.engagements)
      .where(eq(s.engagements.id, engagementId))
      .limit(1)
  )[0];
  if (!row) throw new Error("Engagement not found");
  if (row.lockedAt)
    throw new Error(
      "This annual file is locked. Reopen it with a documented reason before making changes.",
    );
  return row;
}
async function concernEvent(
  concern: typeof s.concerns.$inferSelect,
  who: Principal,
  eventType: string,
  body: string,
  metadata: Record<string, unknown> = {},
) {
  await getDb().insert(s.concernEvents).values({
    concernId: concern.id,
    engagementId: concern.engagementId,
    eventType,
    body,
    metadata: JSON.stringify(metadata),
    actorEmail: who.email,
    actorName: who.name,
  });
}

async function getConcern(id: number) {
  const concern = (
    await getDb().select().from(s.concerns).where(eq(s.concerns.id, id)).limit(1)
  )[0];
  if (!concern) throw new Error("Concern not found");
  await requireOpen(concern.engagementId);
  return concern;
}

async function nextConcernReference(engagementId: number) {
  const rows = await getDb()
    .select({ reference: s.concerns.reference })
    .from(s.concerns)
    .where(eq(s.concerns.engagementId, engagementId));
  const next =
    Math.max(
      0,
      ...rows.map((row) => Number(row.reference.match(/(\d+)$/)?.[1] ?? 0)),
    ) + 1;
  return `FND-${engagementId}-${String(next).padStart(3, "0")}`;
}

async function accessibleConversation(id: number, who: Principal) {
  const db = getDb();
  const thread = (
    await db
      .select()
      .from(s.conversationThreads)
      .where(eq(s.conversationThreads.id, id))
      .limit(1)
  )[0];
  if (!thread) throw new Error("Conversation not found");
  const engagement = (
    await db
      .select()
      .from(s.engagements)
      .where(eq(s.engagements.id, thread.engagementId))
      .limit(1)
  )[0];
  requirePermission(
    Boolean(engagement) && canAccessClient(who, engagement.clientId),
    "This conversation is not available to the signed-in account",
  );
  if (
    who.kind === "CLIENT" &&
    who.clientRoles[engagement.clientId] !== "PORTAL_ADMIN"
  ) {
    const participant = (
      await db
        .select({ id: s.conversationParticipants.id })
        .from(s.conversationParticipants)
        .where(
          and(
            eq(s.conversationParticipants.threadId, id),
            eq(s.conversationParticipants.email, who.email.toLowerCase()),
          ),
        )
        .limit(1)
    )[0];
    requirePermission(
      Boolean(participant),
      "This conversation is not assigned to the signed-in account",
    );
  }
  return { thread, engagement };
}

async function upsertConversationParticipant(
  threadId: number,
  who: Principal,
  lastReadAt?: string,
) {
  const db = getDb();
  const existing = (
    await db
      .select()
      .from(s.conversationParticipants)
      .where(
        and(
          eq(s.conversationParticipants.threadId, threadId),
          eq(s.conversationParticipants.email, who.email),
        ),
      )
      .limit(1)
  )[0];
  if (existing) {
    if (lastReadAt)
      await db
        .update(s.conversationParticipants)
        .set({ lastReadAt })
        .where(eq(s.conversationParticipants.id, existing.id));
    return;
  }
  await db.insert(s.conversationParticipants).values({
    threadId,
    email: who.email,
    name: who.name,
    participantType: who.kind === "CLIENT" ? "CLIENT" : "PRACTICE",
    lastReadAt: lastReadAt ?? null,
  });
}

function conversationText(value: unknown, field = "Message") {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${field} is required`);
  if (text.length > 10_000)
    throw new Error(`${field} cannot exceed 10,000 characters`);
  return text;
}
export async function GET() {
  try {
    await seedIfEmpty();
    const who = await actor();
    return json(await getState(who));
  } catch (error) {
    return errorResponse(error, "Unable to load application data");
  }
}

export async function POST(request: Request) {
  try {
    await seedIfEmpty();
    enforceSameOrigin(request);
    requireContentType(request, "json");
    const db = getDb();
    const who = await actor();
    await enforceRateLimit(`state:${who.email}`, 120, 60_000);
    const body = (await request.json()) as Record<string, unknown>;
    validatePayload(body);
    const action = String(body.action || "");
    await authoriseAction(who, action, body);
    if (action === "createClient") {
      if (!body.name || !body.charityNumber || !body.contactEmail)
        return Response.json(
          { error: "Name, charity number and contact email are required" },
          { status: 400 },
        );
      const [row] = await db
        .insert(s.clients)
        .values({
          name: String(body.name).trim(),
          charityNumber: String(body.charityNumber).trim(),
          legalForm: String(body.legalForm || "CIO"),
          contactName: String(body.contactName || ""),
          contactEmail: requireEmail(String(body.contactEmail)),
        })
        .returning();
      await audit(null, who.email, "CLIENT_CREATED", "client", String(row.id), {
        name: row.name,
      });
    } else if (action === "updateClient") {
      const id = Number(body.clientId);
      const row = (
        await db.select().from(s.clients).where(eq(s.clients.id, id)).limit(1)
      )[0];
      if (!row)
        return Response.json({ error: "Client not found" }, { status: 404 });
      await db
        .update(s.clients)
        .set({
          name: String(body.name || row.name).trim(),
          charityNumber: String(body.charityNumber || row.charityNumber).trim(),
          legalForm: String(body.legalForm || row.legalForm),
          contactName: String(body.contactName || row.contactName),
          contactEmail: requireEmail(
            String(body.contactEmail || row.contactEmail),
          ),
          status: requireOneOf(
            String(body.status || row.status),
            ["ACTIVE", "INACTIVE"],
            "client status",
          ),
        })
        .where(eq(s.clients.id, id));
      await audit(null, who.email, "CLIENT_UPDATED", "client", String(id), {
        name: body.name || row.name,
      });
    } else if (action === "createEngagement") {
      const clientId = Number(body.clientId);
      if (!clientId || !body.periodEnd)
        return Response.json(
          { error: "Client and reporting date are required" },
          { status: 400 },
        );
      const jurisdiction = String(body.jurisdiction || "ENGLAND_WALES");
      const periodEnd = requireIsoDate(String(body.periodEnd), "reporting date");
      const periodStart = requireIsoDate(String(body.periodStart), "reporting period start date");
      if (periodStart > periodEnd)
        return Response.json({ error: "Period start cannot be after period end" }, { status: 400 });
      const { rule } = await applicableRuleSet(jurisdiction, periodEnd, periodStart);
      const practicePolicy = (await db.select().from(s.practiceSettings).limit(1))[0];
      const defaultQualityReviewMode =
        practicePolicy?.defaultQualityReviewMode ?? "NONE";
      const [eng] = await db
        .insert(s.engagements)
        .values({
          clientId,
          periodEnd,
          periodStart,
          accountingBasis: requireOneOf(
            String(body.accountingBasis || "Accruals"),
            ["Accruals", "Receipts and payments"],
            "accounting basis",
          ),
          grossIncome: requireNonNegativeNumber(
            body.grossIncome || 0,
            "Gross income",
          ),
          grossAssets: requireNonNegativeNumber(
            body.grossAssets || 0,
            "Gross assets",
          ),
          materiality: requireNonNegativeNumber(
            body.materiality || 0,
            "Material significance threshold",
          ),
          risk: requireOneOf(
            String(body.risk || "STANDARD"),
            ["LOW", "STANDARD", "HIGH"],
            "risk rating",
          ),
          jurisdiction,
          jurisdictionRuleSetId: rule.id,
          methodologyVersion: rule.version,
          qualityReviewMode: defaultQualityReviewMode,
          qualityReviewStatus:
            defaultQualityReviewMode === "NONE" ? "NOT_REQUIRED" : "PLANNED",
          fundProfile: String(body.fundProfile || "MULTI_FUND"),
          complexity: String(body.complexity || body.risk || "STANDARD"),
          status: "PLANNING",
        })
        .returning();
      const programme = programmeForJurisdiction(jurisdiction);
      const created = await db
        .insert(s.tasks)
        .values(
          programme.map((d) => ({
            engagementId: eng.id,
            direction: d.id,
            title: d.title,
            objective: d.objective,
            phase: d.phase,
            guidance: `Applies to: ${d.applies}. Document the work performed, evidence obtained, significant judgements and conclusion in sufficient detail to support the independent examination.`,
          })),
        )
        .returning();
      for (const task of created) {
        const d = programme.find((x) => x.id === task.direction)!;
        await db.insert(s.procedures).values(
          d.procedures.map((text, index) => ({
            taskId: task.id,
            sequence: index + 1,
            text,
          })),
        );
      }
      await audit(
        eng.id,
        who.email,
        "ENGAGEMENT_CREATED",
        "engagement",
        String(eng.id),
        { clientId, periodEnd: body.periodEnd },
      );
    } else if (action === "updateEngagement") {
      const id = Number(body.engagementId);
      const row = (
        await db
          .select()
          .from(s.engagements)
          .where(eq(s.engagements.id, id))
          .limit(1)
      )[0];
      if (!row)
        return Response.json(
          { error: "Engagement not found" },
          { status: 404 },
        );
      await requireOpen(id);
      const periodEnd = requireIsoDate(
          String(body.periodEnd || row.periodEnd),
          "reporting date",
        ),
        periodStart = requireIsoDate(String(body.periodStart || row.periodStart), "reporting period start date"),
        jurisdiction = String(body.jurisdiction || row.jurisdiction),
        { rule } = await applicableRuleSet(jurisdiction, periodEnd, periodStart);
      if (periodStart > periodEnd)
        return Response.json({ error: "Period start cannot be after period end" }, { status: 400 });
      await db
        .update(s.engagements)
        .set({
          periodEnd,
          periodStart,
          accountingBasis: requireOneOf(
            String(body.accountingBasis || row.accountingBasis),
            ["Accruals", "Receipts and payments"],
            "accounting basis",
          ),
          grossIncome: requireNonNegativeNumber(
            body.grossIncome ?? row.grossIncome,
            "Gross income",
          ),
          grossAssets: requireNonNegativeNumber(
            body.grossAssets ?? row.grossAssets,
            "Gross assets",
          ),
          materiality: requireNonNegativeNumber(
            body.materiality ?? row.materiality,
            "Material significance threshold",
          ),
          risk: requireOneOf(
            String(body.risk || row.risk),
            ["LOW", "STANDARD", "HIGH"],
            "risk rating",
          ),
          jurisdiction,
          jurisdictionRuleSetId: rule.id,
          methodologyVersion: rule.version,
          fundProfile: String(body.fundProfile || row.fundProfile),
          complexity: String(body.complexity || row.complexity),
          status: requireOneOf(
            String(body.status || row.status),
            [
              "PLANNING",
              "CLIENT_INPUT",
              "FIELDWORK",
              "REVIEW",
              "COMPLETION",
              "SIGNED",
            ],
            "engagement status",
          ),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(s.engagements.id, id));
      await audit(
        id,
        who.email,
        "ENGAGEMENT_UPDATED",
        "engagement",
        String(id),
        { status: body.status || row.status },
      );
    } else if (action === "createTask") {
      const engagementId = Number(body.engagementId);
      const title = String(body.title || "").trim();
      const objective = String(body.objective || "").trim();
      if (!engagementId || !title || !objective)
        return Response.json(
          { error: "Engagement, task title and objective are required" },
          { status: 400 },
        );
      await requireOpen(engagementId);
      const existing = await db
        .select()
        .from(s.tasks)
        .where(eq(s.tasks.engagementId, engagementId));
      const direction = Math.max(13, ...existing.map((t) => t.direction)) + 1;
      const [task] = await db
        .insert(s.tasks)
        .values({
          engagementId,
          direction,
          title,
          objective,
          phase: String(body.phase || "Fieldwork"),
          guidance: String(
            body.guidance ||
              "Record the work performed, evidence obtained and conclusion.",
          ),
          isCustom: true,
        })
        .returning();
      const procedureLines = String(body.procedures || "")
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean);
      if (procedureLines.length)
        await db.insert(s.procedures).values(
          procedureLines.map((text, index) => ({
            taskId: task.id,
            sequence: index + 1,
            text,
          })),
        );
      await audit(
        engagementId,
        who.email,
        "CUSTOM_TASK_CREATED",
        "task",
        String(task.id),
        { direction, title },
      );
    } else if (action === "saveTask") {
      const id = Number(body.taskId);
      const task = (
        await db.select().from(s.tasks).where(eq(s.tasks.id, id)).limit(1)
      )[0];
      if (!task)
        return Response.json({ error: "Workpaper not found" }, { status: 404 });
      await requireOpen(task.engagementId);
      const conclusion = String(body.conclusion ?? task.conclusion).trim();
      const status = String(body.status ?? task.status);
      const now = new Date().toISOString();
      if (
        !["NOT_STARTED", "IN_PROGRESS", "PREPARED", "REVIEWED"].includes(status)
      )
        return Response.json(
          { error: "Select a valid workpaper status" },
          { status: 400 },
        );
      if ((status === "PREPARED" || status === "REVIEWED") && !conclusion)
        return Response.json(
          { error: "A documented conclusion is required before sign-off" },
          { status: 400 },
        );
      const procedures = await db
        .select()
        .from(s.procedures)
        .where(eq(s.procedures.taskId, id));
      if (
        (status === "PREPARED" || status === "REVIEWED") &&
        (!procedures.length ||
          procedures.some(
            (p) => p.status !== "PREPARED" && p.status !== "REVIEWED",
          ))
      )
        return Response.json(
          {
            error:
              "Every procedure must contain evidence, a conclusion and preparer sign-off before the direction can be prepared",
          },
          { status: 400 },
        );
      if (status === "REVIEWED") {
        if (procedures.some((p) => p.status !== "REVIEWED"))
          return Response.json(
            {
              error:
                "Every procedure requires reviewer sign-off before the direction can be reviewed",
            },
            { status: 400 },
          );
        if (task.status !== "PREPARED" && !task.preparedBy)
          return Response.json(
            {
              error: "The direction must be prepared before it can be reviewed",
            },
            { status: 400 },
          );
        await requireDifferentSigner(
          who,
          task.engagementId,
          id,
          null,
          "PREPARED",
        );
      }
      await db
        .update(s.tasks)
        .set({
          conclusion,
          status,
          preparedBy: status === "PREPARED" ? who.name : task.preparedBy,
          preparedAt: status === "PREPARED" ? now : task.preparedAt,
          reviewedBy: status === "REVIEWED" ? who.name : task.reviewedBy,
          reviewedAt: status === "REVIEWED" ? now : task.reviewedAt,
          updatedAt: now,
        })
        .where(eq(s.tasks.id, id));
      const [{ v }] = await db
        .select({ v: max(s.workpaperVersions.version) })
        .from(s.workpaperVersions)
        .where(eq(s.workpaperVersions.taskId, id));
      const hash = await snapshotHash({ conclusion, status });
      await db.insert(s.workpaperVersions).values({
        taskId: id,
        version: (v ?? 0) + 1,
        conclusion,
        status,
        contentHash: hash,
        actorEmail: who.email,
      });
      await db.insert(s.signoffs).values({
        engagementId: task.engagementId,
        taskId: id,
        type: status,
        statement: `Workpaper Direction ${task.direction} ${status.toLowerCase()}`,
        snapshotHash: hash,
        signedBy: who.email,
      });
      await audit(
        task.engagementId,
        who.email,
        "WORKPAPER_SAVED",
        "task",
        String(id),
        { status, hash },
      );
    } else if (action === "saveProcedure") {
      const id = Number(body.procedureId);
      const procedure = (
        await db
          .select()
          .from(s.procedures)
          .where(eq(s.procedures.id, id))
          .limit(1)
      )[0];
      if (!procedure)
        return Response.json({ error: "Procedure not found" }, { status: 404 });
      const task = (
        await db
          .select()
          .from(s.tasks)
          .where(eq(s.tasks.id, procedure.taskId))
          .limit(1)
      )[0];
      if (!task)
        return Response.json({ error: "Direction not found" }, { status: 404 });
      await requireOpen(task.engagementId);
      const evidenceSummary = String(
          body.evidenceSummary ?? procedure.evidenceSummary,
        ).trim(),
        workPerformed = String(
          body.workPerformed ?? procedure.workPerformed,
        ).trim(),
        conclusion = String(body.conclusion ?? procedure.conclusion).trim(),
        status = String(body.status ?? procedure.status),
        applicability = String(body.applicability ?? procedure.applicability),
        applicabilityRationale = String(
          body.applicabilityRationale ?? procedure.applicabilityRationale,
        ).trim(),
        concernIdentified = Boolean(body.concernIdentified),
        concernSummary = String(
          body.concernSummary ?? procedure.concernSummary,
        ).trim(),
        now = new Date().toISOString();
      if (
        !["NOT_STARTED", "IN_PROGRESS", "PREPARED", "REVIEWED"].includes(status)
      )
        return Response.json(
          { error: "Select a valid procedure status" },
          { status: 400 },
        );
      if (
        !["APPLICABLE", "NOT_APPLICABLE", "ESCALATED"].includes(applicability)
      )
        return Response.json(
          { error: "Select a valid procedure applicability" },
          { status: 400 },
        );
      if (applicability === "NOT_APPLICABLE" && !applicabilityRationale)
        return Response.json(
          {
            error:
              "A documented rationale is required for a procedure marked not applicable",
          },
          { status: 400 },
        );
      if (
        (applicability === "ESCALATED" || concernIdentified) &&
        !concernSummary
      )
        return Response.json(
          { error: "Describe the concern and why targeted work is required" },
          { status: 400 },
        );
      if (
        (status === "PREPARED" || status === "REVIEWED") &&
        applicability !== "NOT_APPLICABLE" &&
        (!evidenceSummary || !workPerformed || !conclusion)
      )
        return Response.json(
          {
            error:
              "Evidence, work performed and a procedure conclusion are required before sign-off",
          },
          { status: 400 },
        );
      if (
        status === "REVIEWED" &&
        procedure.status !== "PREPARED" &&
        !procedure.preparedBy
      )
        return Response.json(
          { error: "The procedure requires preparer sign-off before review" },
          { status: 400 },
        );
      if (status === "REVIEWED")
        await requireDifferentSigner(
          who,
          task.engagementId,
          task.id,
          id,
          "PROCEDURE_PREPARED",
        );
      const hash = await snapshotHash({
        procedureId: id,
        applicability,
        applicabilityRationale,
        concernIdentified,
        concernSummary,
        evidenceSummary,
        workPerformed,
        conclusion,
        status,
      });
      await db
        .update(s.procedures)
        .set({
          applicability,
          applicabilityRationale,
          concernIdentified,
          concernSummary,
          evidenceSummary,
          workPerformed,
          conclusion,
          status,
          completed: status === "PREPARED" || status === "REVIEWED",
          completedBy:
            status === "PREPARED"
              ? procedure.preparedBy || who.name
              : procedure.completedBy,
          completedAt:
            status === "PREPARED"
              ? procedure.preparedAt || now
              : procedure.completedAt,
          preparedBy: status === "PREPARED" ? who.name : procedure.preparedBy,
          preparedAt: status === "PREPARED" ? now : procedure.preparedAt,
          reviewedBy: status === "REVIEWED" ? who.name : procedure.reviewedBy,
          reviewedAt: status === "REVIEWED" ? now : procedure.reviewedAt,
        })
        .where(eq(s.procedures.id, id));
      if (applicability === "ESCALATED" || concernIdentified) {
        const existingConcern = (
          await db
            .select()
            .from(s.concerns)
            .where(eq(s.concerns.procedureId, id))
            .limit(1)
        )[0];
        if (!existingConcern) {
          const [created] = await db.insert(s.concerns).values({
          engagementId: task.engagementId,
          taskId: task.id,
          procedureId: id,
          reference: await nextConcernReference(task.engagementId),
          sourceType: "PROCEDURE",
          title: `Concern from procedure ${task.direction}.${procedure.sequence}`,
          description: concernSummary,
          severity: "MEDIUM",
          targetedResponse:
            "Perform additional targeted verification proportionate to the matter identified.",
          owner: who.name,
          createdBy: who.email,
          }).returning();
          await concernEvent(created, who, "CREATED", concernSummary, {
            source: `Procedure ${task.direction}.${procedure.sequence}`,
          });
        }
      }
      if (status === "PREPARED" || status === "REVIEWED")
        await db.insert(s.signoffs).values({
          engagementId: task.engagementId,
          taskId: task.id,
          procedureId: id,
          type: `PROCEDURE_${status}`,
          statement: `Procedure ${task.direction}.${procedure.sequence} ${status.toLowerCase()} (${applicability.toLowerCase().replace("_", " ")})`,
          snapshotHash: hash,
          signedBy: who.email,
        });
      if (task.status === "NOT_STARTED")
        await db
          .update(s.tasks)
          .set({ status: "IN_PROGRESS", updatedAt: now })
          .where(eq(s.tasks.id, task.id));
      await audit(
        task.engagementId,
        who.email,
        "PROCEDURE_SAVED",
        "procedure",
        String(id),
        { status, applicability, hash },
      );
    } else if (action === "addComment") {
      const bodyText = String(body.body || "").trim();
      if (!bodyText)
        return Response.json({ error: "Comment is required" }, { status: 400 });
      const requestId = body.requestId ? Number(body.requestId) : null;
      const visibility = String(body.visibility || "INTERNAL");
      await db.insert(s.comments).values({
        engagementId: Number(body.engagementId),
        taskId: body.taskId ? Number(body.taskId) : null,
        requestId,
        authorEmail: who.email,
        authorName: who.name,
        visibility,
        body: bodyText,
      });
      if (requestId && visibility === "CLIENT") {
        const thread = (
          await db
            .select()
            .from(s.conversationThreads)
            .where(eq(s.conversationThreads.requestId, requestId))
            .limit(1)
        )[0];
        if (thread) {
          const now = new Date().toISOString();
          await db.insert(s.conversationMessages).values({
            threadId: thread.id,
            authorEmail: who.email,
            authorName: who.name,
            authorType: "PRACTICE",
            body: bodyText,
            createdAt: now,
          });
          await db
            .update(s.conversationThreads)
            .set({
              status: "WAITING_CLIENT",
              lastMessageAt: now,
              updatedAt: now,
            })
            .where(eq(s.conversationThreads.id, thread.id));
        }
      }
      if (requestId) {
        const thread = (
          await db
            .select()
            .from(s.conversationThreads)
            .where(eq(s.conversationThreads.requestId, requestId))
            .limit(1)
        )[0];
        if (thread) {
          const now = new Date().toISOString();
          await db.insert(s.conversationMessages).values({
            threadId: thread.id,
            authorEmail: who.email,
            authorName: who.name,
            authorType: who.kind === "CLIENT" ? "CLIENT" : "PRACTICE",
            body: bodyText,
            createdAt: now,
          });
          await db
            .update(s.conversationThreads)
            .set({
              status:
                statusAfterMessage(who.kind),
              lastMessageAt: now,
              updatedAt: now,
            })
            .where(eq(s.conversationThreads.id, thread.id));
          await upsertConversationParticipant(thread.id, who, now);
        }
      }
      await audit(
        Number(body.engagementId),
        who.email,
        "COMMENT_ADDED",
        "comment",
        "new",
        { taskId: body.taskId },
      );
    } else if (action === "createRequest") {
      const engagementId = Number(body.engagementId),
        procedureId = body.procedureId ? Number(body.procedureId) : null;
      let taskId = body.taskId ? Number(body.taskId) : null;
      if (procedureId) {
        const procedure = (
          await db
            .select()
            .from(s.procedures)
            .where(eq(s.procedures.id, procedureId))
            .limit(1)
        )[0];
        if (!procedure)
          return Response.json(
            { error: "Linked procedure not found" },
            { status: 404 },
          );
        const task = (
          await db
            .select()
            .from(s.tasks)
            .where(eq(s.tasks.id, procedure.taskId))
            .limit(1)
        )[0];
        if (!task || task.engagementId !== engagementId)
          return Response.json(
            { error: "Linked procedure does not belong to this engagement" },
            { status: 400 },
          );
        taskId = task.id;
      }
      const ref = `REQ-${String(Date.now()).slice(-5)}`;
      const [row] = await db
        .insert(s.evidenceRequests)
        .values({
          engagementId,
          taskId,
          procedureId,
          reference: ref,
          title: String(body.title || "Evidence request"),
          description: String(
            body.description || "Please provide the requested evidence.",
          ),
          contactName: String(body.contactName || "Client contact"),
          contactEmail: String(body.contactEmail || "client@example.org"),
          dueDate: String(
            body.dueDate ||
              new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
          ),
        })
        .returning();
      const now = new Date().toISOString();
      const [thread] = await db
        .insert(s.conversationThreads)
        .values({
          engagementId,
          requestId: row.id,
          subject: row.title,
          category: "EVIDENCE",
          priority: "NORMAL",
          status: "WAITING_CLIENT",
          assignedTo: who.email,
          createdBy: who.email,
          lastMessageAt: now,
        })
        .returning();
      await db.insert(s.conversationParticipants).values([
        {
          threadId: thread.id,
          email: who.email,
          name: who.name,
          participantType: "PRACTICE",
          lastReadAt: now,
        },
        {
          threadId: thread.id,
          email: row.contactEmail.toLowerCase(),
          name: row.contactName,
          participantType: "CLIENT",
        },
      ]);
      await db.insert(s.conversationMessages).values({
        threadId: thread.id,
        authorEmail: who.email,
        authorName: who.name,
        authorType: "PRACTICE",
        body: row.description,
        createdAt: now,
      });
      await audit(
        row.engagementId,
        who.email,
        "REQUEST_SENT",
        "evidence_request",
        String(row.id),
        { reference: ref, conversationThreadId: thread.id },
      );
    } else if (action === "updateRequest") {
      const id = Number(body.requestId);
      const row = (
        await db
          .select()
          .from(s.evidenceRequests)
          .where(eq(s.evidenceRequests.id, id))
          .limit(1)
      )[0];
      if (!row)
        return Response.json(
          { error: "Evidence request not found" },
          { status: 404 },
        );
      const status = String(body.status || row.status);
      await db
        .update(s.evidenceRequests)
        .set({
          title: String(body.title || row.title),
          description: String(body.description || row.description),
          dueDate: String(body.dueDate || row.dueDate),
          status,
          receivedAt:
            status === "RECEIVED"
              ? row.receivedAt || new Date().toISOString()
              : null,
        })
        .where(eq(s.evidenceRequests.id, id));
      await audit(
        row.engagementId,
        who.email,
        "REQUEST_UPDATED",
        "evidence_request",
        String(id),
        { status },
      );
    } else if (action === "createReviewNote") {
      const engagementId = Number(body.engagementId);
      if (!engagementId || !body.title || !body.body)
        return Response.json(
          { error: "Engagement, title and review point are required" },
          { status: 400 },
        );
      const count =
        (
          await db
            .select()
            .from(s.reviewNotes)
            .where(eq(s.reviewNotes.engagementId, engagementId))
        ).length + 1;
      const [row] = await db
        .insert(s.reviewNotes)
        .values({
          engagementId,
          taskId: body.taskId ? Number(body.taskId) : null,
          reference: `RN-${String(count).padStart(3, "0")}`,
          title: String(body.title),
          body: String(body.body),
          severity: String(body.severity || "MEDIUM"),
          raisedBy: who.name,
        })
        .returning();
      await audit(
        engagementId,
        who.email,
        "REVIEW_NOTE_RAISED",
        "review_note",
        String(row.id),
        { severity: row.severity },
      );
    } else if (action === "resolveNote") {
      const id = Number(body.noteId);
      const note = (
        await db
          .select()
          .from(s.reviewNotes)
          .where(eq(s.reviewNotes.id, id))
          .limit(1)
      )[0];
      if (!note)
        return Response.json(
          { error: "Review note not found" },
          { status: 404 },
        );
      const response = String(body.response || "").trim();
      if (!response)
        return Response.json(
          { error: "A clearance response is required" },
          { status: 400 },
        );
      await db
        .update(s.reviewNotes)
        .set({
          status: "CLEARED",
          response,
          clearedBy: who.name,
          clearedAt: new Date().toISOString(),
        })
        .where(eq(s.reviewNotes.id, id));
      await audit(
        note.engagementId,
        who.email,
        "REVIEW_NOTE_CLEARED",
        "review_note",
        String(id),
        { response },
      );
    } else if (action === "reopenNote") {
      const id = Number(body.noteId);
      const note = (
        await db
          .select()
          .from(s.reviewNotes)
          .where(eq(s.reviewNotes.id, id))
          .limit(1)
      )[0];
      if (!note)
        return Response.json(
          { error: "Review note not found" },
          { status: 404 },
        );
      await db
        .update(s.reviewNotes)
        .set({ status: "OPEN", clearedBy: null, clearedAt: null })
        .where(eq(s.reviewNotes.id, id));
      await audit(
        note.engagementId,
        who.email,
        "REVIEW_NOTE_REOPENED",
        "review_note",
        String(id),
        {},
      );
    } else if (action === "addTeamMember") {
      const email = requireEmail(String(body.email || ""));
      const name = String(body.name || "").trim();
      if (!email || !name)
        return Response.json(
          { error: "Name and email are required" },
          { status: 400 },
        );
      const [row] = await db
        .insert(s.users)
        .values({
          email,
          name,
          role: requireInternalRole(String(body.role || "PREPARER")),
        })
        .onConflictDoUpdate({
          target: s.users.email,
          set: {
            name,
            role: requireInternalRole(String(body.role || "PREPARER")),
          },
        })
        .returning();
      await audit(
        null,
        who.email,
        "TEAM_MEMBER_SAVED",
        "user",
        String(row.id),
        { email, role: row.role },
      );
    } else if (action === "updateTeamMember") {
      const id = Number(body.userId);
      const row = (
        await db.select().from(s.users).where(eq(s.users.id, id)).limit(1)
      )[0];
      if (!row)
        return Response.json(
          { error: "Team member not found" },
          { status: 404 },
        );
      const status = requireOneOf(
        String(body.status || row.status),
        ["ACTIVE", "INACTIVE"],
        "team member status",
      );
      requirePermission(
        row.email.toLowerCase() !== who.email.toLowerCase() ||
          status === "ACTIVE",
        "An administrator cannot deactivate their own account",
      );
      const role = requireInternalRole(String(body.role || row.role));
      if (
        status === "INACTIVE" &&
        ["ADMIN", "INDEPENDENT_EXAMINER"].includes(row.role)
      ) {
        const remainingAdministrators = (await db.select().from(s.users)).filter(
          (member) =>
            member.id !== id &&
            member.status === "ACTIVE" &&
            ["ADMIN", "INDEPENDENT_EXAMINER"].includes(member.role),
        );
        requirePermission(
          remainingAdministrators.length > 0,
          "The last active practice administrator cannot be deactivated",
        );
      }
      await db.update(s.users).set({ status, role }).where(eq(s.users.id, id));
      await audit(null, who.email, "TEAM_MEMBER_UPDATED", "user", String(id), {
        status,
        role,
      });
    } else if (action === "updateJurisdiction") {
      const id = Number(body.jurisdictionId);
      const row = (
        await db
          .select()
          .from(s.jurisdictions)
          .where(eq(s.jurisdictions.id, id))
          .limit(1)
      )[0];
      if (!row)
        return Response.json({ error: "Jurisdiction not found" }, { status: 404 });
      const name = String(body.name || row.name).trim(),
        regulator = String(body.regulator || row.regulator).trim(),
        regulatorUrl = String(body.regulatorUrl || row.regulatorUrl).trim(),
        status = requireOneOf(
          String(body.status || row.status),
          ["ACTIVE", "INACTIVE"],
          "jurisdiction status",
        );
      if (!name || !regulator || !/^https:\/\//.test(regulatorUrl))
        return Response.json(
          { error: "Name, regulator and an HTTPS regulator URL are required" },
          { status: 400 },
        );
      if (status === "INACTIVE") {
        const activeEngagements = (
          await db
            .select()
            .from(s.engagements)
            .where(eq(s.engagements.jurisdiction, row.code))
        ).filter((engagement) => engagement.status !== "SIGNED");
        if (activeEngagements.length)
          return Response.json(
            {
              error: `This jurisdiction is used by ${activeEngagements.length} active engagement${activeEngagements.length === 1 ? "" : "s"}`,
            },
            { status: 409 },
          );
      }
      await db
        .update(s.jurisdictions)
        .set({ name, regulator, regulatorUrl, status, updatedBy: who.email, updatedAt: new Date().toISOString() })
        .where(eq(s.jurisdictions.id, id));
      await audit(null, who.email, "JURISDICTION_UPDATED", "jurisdiction", String(id), { name, status });
    } else if (action === "createJurisdictionRuleSet") {
      const jurisdictionId = Number(body.jurisdictionId),
        sourceId = Number(body.sourceRuleSetId || 0),
        jurisdiction = (
          await db
            .select()
            .from(s.jurisdictions)
            .where(eq(s.jurisdictions.id, jurisdictionId))
            .limit(1)
        )[0];
      if (!jurisdiction)
        return Response.json({ error: "Jurisdiction not found" }, { status: 404 });
      const source = sourceId
        ? (
            await db
              .select()
              .from(s.jurisdictionRuleSets)
              .where(eq(s.jurisdictionRuleSets.id, sourceId))
              .limit(1)
          )[0]
        : undefined;
      if (source && source.jurisdictionId !== jurisdictionId)
        return Response.json(
          { error: "The source version belongs to another jurisdiction" },
          { status: 400 },
        );
      const version = String(body.version || "").trim();
      const effectiveFrom = body.effectiveFrom
        ? requireIsoDate(String(body.effectiveFrom), "effective from date")
        : "";
      if (!version || !effectiveFrom)
        return Response.json(
          { error: "Version, effective date and source version are required" },
          { status: 400 },
        );
      if (!source)
        return Response.json(
          { error: "Select the published version used as the drafting baseline" },
          { status: 400 },
        );
      const publishedRules = (
        await db
          .select()
          .from(s.jurisdictionRuleSets)
          .where(eq(s.jurisdictionRuleSets.jurisdictionId, jurisdictionId))
      ).filter((item) => item.status === "PUBLISHED");
      const latestPublished = publishedRules.sort((a, b) =>
        b.effectiveFrom.localeCompare(a.effectiveFrom),
      )[0];
      if (
        latestPublished &&
        (source.id !== latestPublished.id || effectiveFrom <= latestPublished.effectiveFrom)
      )
        return Response.json(
          {
            error: `Use ${latestPublished.version} as the baseline and select an effective date after ${latestPublished.effectiveFrom}`,
          },
          { status: 409 },
        );
      const duplicate = (
        await db
          .select()
          .from(s.jurisdictionRuleSets)
          .where(eq(s.jurisdictionRuleSets.jurisdictionId, jurisdictionId))
      ).some((item) => item.version.toLowerCase() === version.toLowerCase());
      if (duplicate)
        return Response.json(
          { error: "Rule version must be unique within the jurisdiction" },
          { status: 409 },
        );
      const [created] = await db
        .insert(s.jurisdictionRuleSets)
        .values({
          jurisdictionId,
          version,
          status: "DRAFT",
          effectiveFrom,
          effectiveTo: null,
          effectiveDateBasis: source?.effectiveDateBasis ?? "PERIOD_END",
          examinationFloor: source?.examinationFloor ?? 0,
          qualificationFloor: source?.qualificationFloor ?? 250000,
          qualificationFloorInclusive: source?.qualificationFloorInclusive ?? false,
          auditIncome: source?.auditIncome ?? 1000000,
          auditIncomeInclusive: source?.auditIncomeInclusive ?? false,
          assetIncomeFloor: source?.assetIncomeFloor ?? 0,
          auditAssets: source?.auditAssets ?? 3260000,
          allCharitiesScrutinised: source?.allCharitiesScrutinised ?? false,
          assetTestBasis: source?.assetTestBasis ?? "INCOME_AND_ASSETS",
          notes: source?.notes ?? "",
          sourceTitle: source?.sourceTitle ?? jurisdiction.regulator,
          sourceUrl: source?.sourceUrl ?? jurisdiction.regulatorUrl,
          createdBy: who.email,
          updatedBy: who.email,
        })
        .returning();
      await audit(null, who.email, "JURISDICTION_RULE_DRAFT_CREATED", "jurisdiction_rule_set", String(created.id), { jurisdictionId, version: created.version });
    } else if (action === "updateJurisdictionRuleSet") {
      const id = Number(body.ruleSetId),
        row = (
          await db
            .select()
            .from(s.jurisdictionRuleSets)
            .where(eq(s.jurisdictionRuleSets.id, id))
            .limit(1)
        )[0];
      if (!row)
        return Response.json({ error: "Rule set not found" }, { status: 404 });
      requirePermission(row.status === "DRAFT", "Published rule sets are immutable. Create a new draft version instead.");
      const effectiveFrom = requireIsoDate(String(body.effectiveFrom || row.effectiveFrom), "effective from date"),
        effectiveTo = String(body.effectiveTo || "") ? requireIsoDate(String(body.effectiveTo), "effective to date") : null,
        sourceUrl = String(body.sourceUrl || row.sourceUrl).trim();
      if (effectiveTo && effectiveTo < effectiveFrom)
        return Response.json({ error: "Effective to date cannot precede effective from date" }, { status: 400 });
      if (!/^https:\/\//.test(sourceUrl))
        return Response.json({ error: "An HTTPS source URL is required" }, { status: 400 });
      const values = {
        version: String(body.version || row.version).trim(),
        effectiveFrom,
        effectiveTo,
        effectiveDateBasis: requireOneOf(String(body.effectiveDateBasis || row.effectiveDateBasis), ["PERIOD_START", "PERIOD_END"], "effective date basis"),
        examinationFloor: requireNonNegativeNumber(body.examinationFloor ?? row.examinationFloor, "Examination floor"),
        qualificationFloor: requireNonNegativeNumber(body.qualificationFloor ?? row.qualificationFloor, "Qualification floor"),
        qualificationFloorInclusive: Boolean(body.qualificationFloorInclusive),
        auditIncome: requireNonNegativeNumber(body.auditIncome ?? row.auditIncome, "Audit income threshold"),
        auditIncomeInclusive: Boolean(body.auditIncomeInclusive),
        assetIncomeFloor: requireNonNegativeNumber(body.assetIncomeFloor ?? row.assetIncomeFloor, "Asset test income floor"),
        auditAssets: requireNonNegativeNumber(body.auditAssets ?? row.auditAssets, "Audit asset threshold"),
        allCharitiesScrutinised: Boolean(body.allCharitiesScrutinised),
        assetTestBasis: requireOneOf(String(body.assetTestBasis || row.assetTestBasis), ["INCOME_AND_ASSETS", "ACCRUALS_ASSETS", "NONE"], "asset test basis"),
        notes: String(body.notes ?? row.notes).trim(),
        sourceTitle: String(body.sourceTitle || row.sourceTitle).trim(),
        sourceUrl,
        updatedBy: who.email,
        updatedAt: new Date().toISOString(),
      };
      if (!values.version || !values.sourceTitle)
        return Response.json({ error: "Version and source title are required" }, { status: 400 });
      await db.update(s.jurisdictionRuleSets).set(values).where(eq(s.jurisdictionRuleSets.id, id));
      await audit(null, who.email, "JURISDICTION_RULE_DRAFT_UPDATED", "jurisdiction_rule_set", String(id), { version: values.version });
    } else if (action === "saveAndPublishJurisdictionRuleSet") {
      const id = Number(body.ruleSetId);
      const row = (
        await db
          .select()
          .from(s.jurisdictionRuleSets)
          .where(eq(s.jurisdictionRuleSets.id, id))
          .limit(1)
      )[0];
      if (!row)
        return Response.json({ error: "Rule set not found" }, { status: 404 });
      requirePermission(row.status === "DRAFT", "Only draft rule sets can be published");
      const effectiveFrom = requireIsoDate(
          String(body.effectiveFrom || row.effectiveFrom),
          "effective from date",
        ),
        effectiveTo = String(body.effectiveTo || "")
          ? requireIsoDate(String(body.effectiveTo), "effective to date")
          : null,
        sourceUrl = String(body.sourceUrl || row.sourceUrl).trim(),
        values = {
          version: String(body.version || row.version).trim(),
          effectiveFrom,
          effectiveTo,
          effectiveDateBasis: requireOneOf(
            String(body.effectiveDateBasis || row.effectiveDateBasis),
            ["PERIOD_START", "PERIOD_END"],
            "effective date basis",
          ),
          examinationFloor: requireNonNegativeNumber(
            body.examinationFloor ?? row.examinationFloor,
            "Examination floor",
          ),
          qualificationFloor: requireNonNegativeNumber(
            body.qualificationFloor ?? row.qualificationFloor,
            "Qualification floor",
          ),
          qualificationFloorInclusive: Boolean(body.qualificationFloorInclusive),
          auditIncome: requireNonNegativeNumber(
            body.auditIncome ?? row.auditIncome,
            "Audit income threshold",
          ),
          auditIncomeInclusive: Boolean(body.auditIncomeInclusive),
          assetIncomeFloor: requireNonNegativeNumber(
            body.assetIncomeFloor ?? row.assetIncomeFloor,
            "Asset test income floor",
          ),
          auditAssets: requireNonNegativeNumber(
            body.auditAssets ?? row.auditAssets,
            "Audit asset threshold",
          ),
          allCharitiesScrutinised: Boolean(body.allCharitiesScrutinised),
          assetTestBasis: requireOneOf(
            String(body.assetTestBasis || row.assetTestBasis),
            ["INCOME_AND_ASSETS", "ACCRUALS_ASSETS", "NONE"],
            "asset test basis",
          ),
          notes: String(body.notes ?? row.notes).trim(),
          sourceTitle: String(body.sourceTitle || row.sourceTitle).trim(),
          sourceUrl,
          updatedBy: who.email,
          updatedAt: new Date().toISOString(),
        };
      if (!values.version || !values.sourceTitle || !/^https:\/\//.test(sourceUrl))
        return Response.json(
          { error: "Version, source title and an HTTPS source URL are required" },
          { status: 400 },
        );
      if (effectiveTo)
        return Response.json(
          { error: "A newly published version must remain open ended" },
          { status: 400 },
        );
      const series = await db
        .select()
        .from(s.jurisdictionRuleSets)
        .where(eq(s.jurisdictionRuleSets.jurisdictionId, row.jurisdictionId));
      let publication;
      try {
        publication = planRulePublication(
          { ...row, ...values, status: "DRAFT" },
          series,
        );
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : "Rule series is invalid" },
          { status: 409 },
        );
      }
      const now = new Date().toISOString();
      const statements = [];
      if (publication.predecessorId)
        statements.push(
          db
            .update(s.jurisdictionRuleSets)
            .set({
              effectiveTo: publication.predecessorEffectiveTo,
              updatedBy: who.email,
              updatedAt: now,
            })
            .where(eq(s.jurisdictionRuleSets.id, publication.predecessorId)),
        );
      statements.push(
        db
          .update(s.jurisdictionRuleSets)
          .set({ ...values, status: "PUBLISHED", publishedAt: now })
          .where(eq(s.jurisdictionRuleSets.id, id)),
      );
      await db.batch(statements as [typeof statements[number], ...typeof statements[number][]]);
      await audit(null, who.email, "JURISDICTION_RULE_PUBLISHED", "jurisdiction_rule_set", String(id), {
        version: values.version,
        effectiveFrom,
        predecessorId: publication.predecessorId,
      });
    } else if (action === "publishJurisdictionRuleSet") {
      return Response.json(
        { error: "Publish from the visible rule form so the reviewed values are saved atomically" },
        { status: 409 },
      );
    } else if (action === "createOrganisationType") {
      const name = String(body.name || "").trim(),
        code = String(body.code || name).trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
      if (!name || !code)
        return Response.json({ error: "Organisation type name is required" }, { status: 400 });
      const existingTypes = await db.select().from(s.organisationTypes);
      if (
        existingTypes.some(
          (item) =>
            item.code === code || item.name.toLowerCase() === name.toLowerCase(),
        )
      )
        return Response.json(
          { error: "Organisation type name and code must be unique" },
          { status: 409 },
        );
      const [row] = await db
        .insert(s.organisationTypes)
        .values({ code, name, updatedBy: who.email })
        .returning();
      await audit(null, who.email, "ORGANISATION_TYPE_CREATED", "organisation_type", String(row.id), { code, name });
    } else if (action === "updateOrganisationType") {
      const id = Number(body.organisationTypeId),
        row = (
          await db
            .select()
            .from(s.organisationTypes)
            .where(eq(s.organisationTypes.id, id))
            .limit(1)
        )[0];
      if (!row)
        return Response.json({ error: "Organisation type not found" }, { status: 404 });
      const name = String(body.name || row.name).trim(),
        status = requireOneOf(String(body.status || row.status), ["ACTIVE", "INACTIVE"], "organisation type status");
      if (!name)
        return Response.json({ error: "Organisation type name is required" }, { status: 400 });
      const duplicateName = (await db.select().from(s.organisationTypes)).some(
        (item) =>
          item.id !== id && item.name.toLowerCase() === name.toLowerCase(),
      );
      if (duplicateName)
        return Response.json(
          { error: "Organisation type name must be unique" },
          { status: 409 },
        );
      await db.update(s.organisationTypes).set({ name, status, updatedBy: who.email, updatedAt: new Date().toISOString() }).where(eq(s.organisationTypes.id, id));
      await audit(null, who.email, "ORGANISATION_TYPE_UPDATED", "organisation_type", String(id), { name, status });
    } else if (action === "addTrustee") {
      const clientId = Number(body.clientId),
        name = String(body.name || "").trim(),
        personType = String(body.personType || "TRUSTEE"),
        appointmentDate = String(body.appointmentDate || "") || null,
        resignationDate = String(body.resignationDate || "") || null,
        status = String(body.status || "ACTIVE");
      if (!clientId || !name)
        return Response.json(
          { error: "Client and person name are required" },
          { status: 400 },
        );
      if (!["TRUSTEE", "OFFICER", "BOTH"].includes(personType))
        return Response.json(
          { error: "Select trustee, officer or dual capacity" },
          { status: 400 },
        );
      if (
        resignationDate &&
        appointmentDate &&
        resignationDate < appointmentDate
      )
        return Response.json(
          { error: "The termination date cannot precede the appointment date" },
          { status: 400 },
        );
      if (status !== "ACTIVE" && !resignationDate)
        return Response.json(
          { error: "A termination date is required for an inactive record" },
          { status: 400 },
        );
      const [row] = await db
        .insert(s.trustees)
        .values({
          clientId,
          personType,
          name,
          email: String(body.email || "").trim() || null,
          role: String(body.role || "Trustee").trim(),
          appointmentDate,
          resignationDate,
          status: resignationDate ? "CEASED" : "ACTIVE",
        })
        .returning();
      await audit(
        null,
        who.email,
        "GOVERNANCE_PERSON_ADDED",
        "governance_person",
        String(row.id),
        { clientId, name, personType, status: row.status },
      );
    } else if (action === "updateTrustee") {
      const id = Number(body.trusteeId),
        row = (
          await db
            .select()
            .from(s.trustees)
            .where(eq(s.trustees.id, id))
            .limit(1)
        )[0];
      if (!row)
        return Response.json(
          { error: "Trustee or officer record not found" },
          { status: 404 },
        );
      const name = String(body.name || "").trim(),
        personType = String(body.personType || row.personType),
        appointmentDate = String(body.appointmentDate || "") || null,
        resignationDate = String(body.resignationDate || "") || null,
        status = String(body.status || row.status);
      if (!name)
        return Response.json(
          { error: "Person name is required" },
          { status: 400 },
        );
      if (!["TRUSTEE", "OFFICER", "BOTH"].includes(personType))
        return Response.json(
          { error: "Select trustee, officer or dual capacity" },
          { status: 400 },
        );
      if (
        resignationDate &&
        appointmentDate &&
        resignationDate < appointmentDate
      )
        return Response.json(
          { error: "The termination date cannot precede the appointment date" },
          { status: 400 },
        );
      if (status !== "ACTIVE" && !resignationDate)
        return Response.json(
          { error: "A termination date is required for an inactive record" },
          { status: 400 },
        );
      const update = {
        personType,
        name,
        email: String(body.email || "").trim() || null,
        role: String(body.role || "").trim() || row.role,
        appointmentDate,
        resignationDate,
        status: resignationDate ? "CEASED" : "ACTIVE",
      };
      await db.update(s.trustees).set(update).where(eq(s.trustees.id, id));
      await audit(
        null,
        who.email,
        "GOVERNANCE_PERSON_UPDATED",
        "governance_person",
        String(id),
        {
          clientId: row.clientId,
          name,
          personType,
          status: update.status,
          resignationDate,
        },
      );
    } else if (action === "addClientUser") {
      const clientId = Number(body.clientId),
        name = String(body.name || "").trim(),
        email = requireEmail(String(body.email || "")),
        role = requireClientRole(String(body.role || "CONTRIBUTOR"));
      if (!clientId || !name || !email)
        return Response.json(
          { error: "Client, name and email are required" },
          { status: 400 },
        );
      const existing = (
        await db
          .select()
          .from(s.clientUsers)
          .where(
            and(
              eq(s.clientUsers.clientId, clientId),
              eq(s.clientUsers.email, email),
            ),
          )
          .limit(1)
      )[0];
      const [row] = existing
        ? await db
            .update(s.clientUsers)
            .set({ name, role, status: "ACTIVE" })
            .where(eq(s.clientUsers.id, existing.id))
            .returning()
        : await db
            .insert(s.clientUsers)
            .values({ clientId, name, email, role, status: "ACTIVE" })
            .returning();
      await audit(
        null,
        who.email,
        existing ? "CLIENT_USER_REACTIVATED" : "CLIENT_USER_ADDED",
        "client_user",
        String(row.id),
        { clientId, email },
      );
    } else if (action === "updateClientUser") {
      const id = Number(body.clientUserId);
      const row = (
        await db
          .select()
          .from(s.clientUsers)
          .where(eq(s.clientUsers.id, id))
          .limit(1)
      )[0];
      if (!row)
        return Response.json(
          { error: "Client portal user not found" },
          { status: 404 },
        );
      const status = requireOneOf(
        String(body.status || row.status),
        ["ACTIVE", "INACTIVE"],
        "client user status",
      );
      const role = requireClientRole(String(body.role || row.role));
      await db
        .update(s.clientUsers)
        .set({ status, role })
        .where(eq(s.clientUsers.id, id));
      await audit(
        null,
        who.email,
        "CLIENT_USER_UPDATED",
        "client_user",
        String(id),
        { clientId: row.clientId, status, role },
      );
    } else if (action === "createConversation") {
      const engagementId = Number(body.engagementId);
      const engagement = await requireOpen(engagementId);
      requirePermission(
        canAccessClient(who, engagement.clientId),
        "This engagement is not available to the signed-in account",
      );
      if (who.kind === "CLIENT")
        requirePermission(
          canRespondForClient(who, engagement.clientId),
          "Read-only client accounts cannot start conversations",
        );
      const subject = conversationText(body.subject, "Subject");
      if (subject.length > 160)
        return Response.json(
          { error: "Subject cannot exceed 160 characters" },
          { status: 400 },
        );
      const message = conversationText(body.message);
      const category = requireOneOf(
        String(body.category || "GENERAL"),
        CONVERSATION_CATEGORIES,
        "conversation category",
      );
      const priority =
        who.kind === "CLIENT"
          ? "NORMAL"
          : requireOneOf(
              String(body.priority || "NORMAL"),
              CONVERSATION_PRIORITIES,
              "conversation priority",
            );
      const requestId = body.requestId ? Number(body.requestId) : null;
      if (requestId) {
        const requestRow = (
          await db
            .select()
            .from(s.evidenceRequests)
            .where(eq(s.evidenceRequests.id, requestId))
            .limit(1)
        )[0];
        if (!requestRow || requestRow.engagementId !== engagementId)
          return Response.json(
            { error: "Linked request does not belong to this engagement" },
            { status: 400 },
          );
        const existing = (
          await db
            .select()
            .from(s.conversationThreads)
            .where(eq(s.conversationThreads.requestId, requestId))
            .limit(1)
        )[0];
        if (existing)
          return Response.json(
            { error: "This evidence request already has a conversation" },
            { status: 409 },
          );
      }
      const now = new Date().toISOString();
      const [thread] = await db
        .insert(s.conversationThreads)
        .values({
          engagementId,
          requestId,
          subject,
          category,
          priority,
          status: statusAfterMessage(who.kind),
          assignedTo: who.kind === "INTERNAL" ? who.email : null,
          createdBy: who.email,
          lastMessageAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      await upsertConversationParticipant(thread.id, who, now);
      if (who.kind === "INTERNAL") {
        const client = (
          await db
            .select()
            .from(s.clients)
            .where(eq(s.clients.id, engagement.clientId))
            .limit(1)
        )[0];
        if (client)
          await db.insert(s.conversationParticipants).values({
            threadId: thread.id,
            email: String(body.contactEmail || client.contactEmail)
              .trim()
              .toLowerCase(),
            name: String(body.contactName || client.contactName).trim(),
            participantType: "CLIENT",
          });
      }
      const [createdMessage] = await db
        .insert(s.conversationMessages)
        .values({
          threadId: thread.id,
          authorEmail: who.email,
          authorName: who.name,
          authorType: who.kind === "CLIENT" ? "CLIENT" : "PRACTICE",
          body: message,
          createdAt: now,
        })
        .returning();
      await audit(
        engagementId,
        who.email,
        "CONVERSATION_CREATED",
        "conversation_thread",
        String(thread.id),
        { category, priority, requestId, firstMessageId: createdMessage.id },
      );
    } else if (action === "sendConversationMessage") {
      const threadId = Number(body.threadId);
      const { thread, engagement } = await accessibleConversation(threadId, who);
      if (who.kind === "CLIENT")
        requirePermission(
          canRespondForClient(who, engagement.clientId),
          "Read-only client accounts cannot send messages",
        );
      await requireOpen(thread.engagementId);
      if (thread.status === "RESOLVED")
        return Response.json(
          { error: "Reopen this conversation before adding a further message" },
          { status: 409 },
        );
      const message = conversationText(body.message);
      const replyToMessageId = body.replyToMessageId
        ? Number(body.replyToMessageId)
        : null;
      if (replyToMessageId) {
        const reply = (
          await db
            .select()
            .from(s.conversationMessages)
            .where(eq(s.conversationMessages.id, replyToMessageId))
            .limit(1)
        )[0];
        if (!reply || reply.threadId !== threadId)
          return Response.json(
            { error: "The replied-to message is not in this conversation" },
            { status: 400 },
          );
      }
      const rawAttachmentIds = Array.isArray(body.attachmentIds)
        ? body.attachmentIds
        : [];
      const attachmentIds = rawAttachmentIds
        .map(Number)
        .filter((value) => Number.isInteger(value) && value > 0);
      if (attachmentIds.length > 5)
        return Response.json(
          { error: "A message can contain no more than five attachments" },
          { status: 400 },
        );
      const attachmentRows = [];
      for (const documentId of attachmentIds) {
        const document = (
          await db
            .select()
            .from(s.documents)
            .where(eq(s.documents.id, documentId))
            .limit(1)
        )[0];
        if (
          !document ||
          document.conversationThreadId !== threadId ||
          document.conversationMessageId !== null ||
          document.uploadedBy.toLowerCase() !== who.email.toLowerCase()
        )
          return Response.json(
            { error: "An attachment is not available for this message" },
            { status: 400 },
          );
        attachmentRows.push(document);
      }
      const now = new Date().toISOString();
      const [created] = await db
        .insert(s.conversationMessages)
        .values({
          threadId,
          replyToMessageId,
          authorEmail: who.email,
          authorName: who.name,
          authorType: who.kind === "CLIENT" ? "CLIENT" : "PRACTICE",
          body: message,
          createdAt: now,
        })
        .returning();
      for (const document of attachmentRows)
        await db
          .update(s.documents)
          .set({ conversationMessageId: created.id })
          .where(eq(s.documents.id, document.id));
      await db
        .update(s.conversationThreads)
        .set({
          status: statusAfterMessage(who.kind),
          lastMessageAt: now,
          updatedAt: now,
        })
        .where(eq(s.conversationThreads.id, threadId));
      await upsertConversationParticipant(threadId, who, now);
      await audit(
        thread.engagementId,
        who.email,
        "CONVERSATION_MESSAGE_SENT",
        "conversation_message",
        String(created.id),
        { threadId, replyToMessageId, attachmentIds },
      );
    } else if (action === "markConversationRead") {
      const threadId = Number(body.threadId);
      const { thread } = await accessibleConversation(threadId, who);
      await upsertConversationParticipant(
        threadId,
        who,
        new Date().toISOString(),
      );
      await audit(
        thread.engagementId,
        who.email,
        "CONVERSATION_READ",
        "conversation_thread",
        String(threadId),
        {},
      );
    } else if (action === "updateConversation") {
      requirePermission(
        who.kind === "INTERNAL",
        "Only the engagement team can manage conversation status",
      );
      const threadId = Number(body.threadId);
      const { thread } = await accessibleConversation(threadId, who);
      await requireOpen(thread.engagementId);
      const status = requireOneOf(
        String(body.status || thread.status),
        CONVERSATION_STATUSES,
        "conversation status",
      );
      const priority = requireOneOf(
        String(body.priority || thread.priority),
        CONVERSATION_PRIORITIES,
        "conversation priority",
      );
      const assignedTo = Object.prototype.hasOwnProperty.call(body, "assignedTo")
        ? String(body.assignedTo || "").trim().toLowerCase() || null
        : thread.assignedTo;
      if (assignedTo) {
        const assignee = (
          await db
            .select()
            .from(s.users)
            .where(
              and(
                eq(s.users.email, assignedTo.toLowerCase()),
                eq(s.users.status, "ACTIVE"),
              ),
            )
            .limit(1)
        )[0];
        if (!assignee)
          return Response.json(
            { error: "Conversation owner must be an active practice user" },
            { status: 400 },
          );
      }
      const resolutionNote = String(body.resolutionNote || "").trim();
      const transitionIssue = conversationTransitionIssue(
        thread.status as ConversationStatus,
        status as ConversationStatus,
        resolutionNote,
      );
      if (transitionIssue)
        return Response.json(
          { error: transitionIssue },
          { status: 400 },
        );
      const now = new Date().toISOString();
      await db
        .update(s.conversationThreads)
        .set({
          status,
          priority,
          assignedTo,
          resolvedAt:
            status === "RESOLVED"
              ? thread.status === "RESOLVED"
                ? thread.resolvedAt
                : now
              : null,
          resolvedBy:
            status === "RESOLVED"
              ? thread.status === "RESOLVED"
                ? thread.resolvedBy
                : who.email
              : null,
          updatedAt: now,
          lastMessageAt: resolutionNote ? now : thread.lastMessageAt,
        })
        .where(eq(s.conversationThreads.id, threadId));
      if (resolutionNote)
        await db.insert(s.conversationMessages).values({
          threadId,
          authorEmail: who.email,
          authorName: who.name,
          authorType: "SYSTEM",
          body:
            status === "RESOLVED"
              ? `Conversation resolved: ${resolutionNote}`
              : `Conversation reopened: ${resolutionNote}`,
          createdAt: now,
        });
      await upsertConversationParticipant(threadId, who, now);
      await audit(
        thread.engagementId,
        who.email,
        status === "RESOLVED" ? "CONVERSATION_RESOLVED" : "CONVERSATION_UPDATED",
        "conversation_thread",
        String(threadId),
        { status, priority, assignedTo, resolutionNote },
      );
    } else if (action === "addClientReply") {
      const engagementId = Number(body.engagementId),
        requestId = body.requestId ? Number(body.requestId) : null,
        bodyText = conversationText(body.body, "Reply");
      if (!engagementId || !bodyText)
        return Response.json(
          { error: "Engagement and reply are required" },
          { status: 400 },
        );
      const eng = await requireOpen(engagementId);
      let threadId: number | null = null;
      if (requestId) {
        const evidenceRequest = (
          await db
            .select()
            .from(s.evidenceRequests)
            .where(eq(s.evidenceRequests.id, requestId))
            .limit(1)
        )[0];
        if (!evidenceRequest || evidenceRequest.engagementId !== engagementId)
          return Response.json(
            { error: "Evidence request does not belong to this engagement" },
            { status: 400 },
          );
        if (
          who.kind === "CLIENT" &&
          who.clientRoles[eng.clientId] !== "PORTAL_ADMIN"
        )
          requirePermission(
            evidenceRequest.contactEmail.toLowerCase() ===
              who.email.toLowerCase(),
            "This evidence request is not assigned to the signed-in account",
          );
        const thread = (
          await db
            .select()
            .from(s.conversationThreads)
            .where(eq(s.conversationThreads.requestId, requestId))
            .limit(1)
        )[0];
        if (thread?.status === "RESOLVED")
          return Response.json(
            { error: "Reopen the conversation before adding a response" },
            { status: 409 },
          );
        if (thread) {
          const now = new Date().toISOString();
          const [message] = await db
            .insert(s.conversationMessages)
            .values({
              threadId: thread.id,
              authorEmail: who.email,
              authorName: who.name,
              authorType: who.kind === "CLIENT" ? "CLIENT" : "PRACTICE",
              body: bodyText,
              createdAt: now,
            })
            .returning();
          threadId = thread.id;
          await db
            .update(s.conversationThreads)
            .set({
              status: statusAfterMessage(who.kind),
              lastMessageAt: now,
              updatedAt: now,
            })
            .where(eq(s.conversationThreads.id, thread.id));
          await upsertConversationParticipant(thread.id, who, now);
          await db
            .update(s.evidenceRequests)
            .set({ status: "RECEIVED", receivedAt: now })
            .where(eq(s.evidenceRequests.id, requestId));
          await audit(
            engagementId,
            who.email,
            "CONVERSATION_MESSAGE_SENT",
            "conversation_message",
            String(message.id),
            { threadId: thread.id, requestId },
          );
        } else {
          await db
            .update(s.evidenceRequests)
            .set({
              status: "RECEIVED",
              receivedAt: new Date().toISOString(),
            })
            .where(eq(s.evidenceRequests.id, requestId));
        }
      }
      await db.insert(s.comments).values({
        engagementId,
        requestId,
        authorEmail: who.email,
        authorName: who.name,
        visibility: "CLIENT",
        body: bodyText,
      });
      await audit(
        engagementId,
        who.email,
        "CLIENT_REPLY_ADDED",
        "evidence_request",
        String(requestId || "general"),
        { threadId, status: requestId ? "RECEIVED" : "COMMENTED" },
      );
    } else if (action === "updateScope") {
      const id = Number(body.engagementId);
      const row = await requireOpen(id);
      const jurisdiction = String(body.jurisdiction || row.jurisdiction);
      const { rule } = await applicableRuleSet(jurisdiction, row.periodEnd, row.periodStart);
      const update = {
        jurisdiction,
        jurisdictionRuleSetId: rule.id,
        methodologyVersion: rule.version,
        fundProfile: String(body.fundProfile || row.fundProfile),
        complexity: String(body.complexity || row.complexity),
        scopeConclusion: String(
          body.scopeConclusion ?? row.scopeConclusion,
        ).trim(),
        governingDocumentAudit: Boolean(body.governingDocumentAudit),
        funderAudit: Boolean(body.funderAudit),
        commissionAudit: Boolean(body.commissionAudit),
        groupAccountsRequired: Boolean(body.groupAccountsRequired),
        updatedAt: new Date().toISOString(),
      };
      if (!update.scopeConclusion)
        return Response.json(
          {
            error: "Record the proportionate scoping conclusion before saving",
          },
          { status: 400 },
        );
      await db
        .update(s.engagements)
        .set(update)
        .where(eq(s.engagements.id, id));
      const eligibility = await engagementEligibility({ ...row, ...update });
      await audit(
        id,
        who.email,
        "SCOPE_AND_ELIGIBILITY_UPDATED",
        "engagement",
        String(id),
        {
          ...update,
          route: eligibility.scrutiny,
          qualifiedExaminerRequired: eligibility.qualifiedExaminerRequired,
        },
      );
    } else if (action === "updateQualityReview") {
      const id = Number(body.engagementId);
      const row = await requireOpen(id);
      const mode = String(body.mode || "NONE"),
        conclusion = String(body.conclusion || "").trim(),
        status = String(
          body.status || (mode === "NONE" ? "NOT_REQUIRED" : "PLANNED"),
        );
      if (!["NONE", "SECOND_REVIEW", "HOT_FILE", "COLD_FILE"].includes(mode))
        return Response.json(
          { error: "Select a valid quality review response" },
          { status: 400 },
        );
      if (status === "COMPLETED" && !conclusion)
        return Response.json(
          {
            error: "A quality review conclusion is required before completion",
          },
          { status: 400 },
        );
      if (status === "COMPLETED" && mode !== "NONE") {
        const preparedSigners = (
          await db
            .select()
            .from(s.signoffs)
            .where(eq(s.signoffs.engagementId, id))
        )
          .filter((signoff) => signoff.type.includes("PREPARED"))
          .map((signoff) => signoff.signedBy.toLowerCase());
        requirePermission(
          !preparedSigners.includes(who.email.toLowerCase()),
          "A person who prepared engagement work cannot complete its independent quality review",
        );
      }
      const now = new Date().toISOString();
      await db
        .update(s.engagements)
        .set({
          qualityReviewMode: mode,
          qualityReviewStatus: mode === "NONE" ? "NOT_REQUIRED" : status,
          qualityReviewConclusion: conclusion,
          qualityReviewedBy:
            status === "COMPLETED" ? who.name : row.qualityReviewedBy,
          qualityReviewedAt:
            status === "COMPLETED" ? now : row.qualityReviewedAt,
          updatedAt: now,
        })
        .where(eq(s.engagements.id, id));
      await audit(
        id,
        who.email,
        "QUALITY_REVIEW_UPDATED",
        "engagement",
        String(id),
        { mode, status },
      );
    } else if (action === "createConcern") {
      const engagementId = Number(body.engagementId);
      await requireOpen(engagementId);
      const title = String(body.title || "").trim(),
        description = String(body.description || "").trim();
      if (!title || !description)
        return Response.json(
          { error: "Concern title and description are required" },
          { status: 400 },
        );
      const [created] = await db
        .insert(s.concerns)
        .values({
          engagementId,
          reference: await nextConcernReference(engagementId),
          sourceType: "MANUAL",
          category: requireOneOf(
            String(body.category || "GENERAL"),
            [...concernCategories],
            "concern category",
          ),
          title,
          description,
          severity: requireOneOf(
            String(body.severity || "MEDIUM"),
            ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
            "concern severity",
          ),
          owner: String(body.owner || who.name).trim(),
          createdBy: who.email,
        })
        .returning();
      await concernEvent(created, who, "CREATED", description);
      await audit(engagementId, who.email, "CONCERN_CREATED", "concern", String(created.id), { reference: created.reference });
    } else if (action === "updateConcern") {
      const concern = await getConcern(Number(body.concernId));
      requirePermission(
        ["OPEN", "IN_PROGRESS", "REOPENED"].includes(concern.status),
        "A submitted or closed concern cannot be edited",
      );
      const values = {
        title: String(body.title ?? concern.title).trim(),
        description: String(body.description ?? concern.description).trim(),
        category: requireOneOf(
          String(body.category || concern.category),
          [...concernCategories],
          "concern category",
        ),
        severity: requireOneOf(
          String(body.severity || concern.severity),
          ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
          "concern severity",
        ),
        owner: String(body.owner ?? concern.owner ?? "").trim(),
        targetedResponse: String(body.targetedResponse ?? concern.targetedResponse).trim(),
        managementResponse: String(body.managementResponse ?? concern.managementResponse).trim(),
        examinerConclusion: String(body.examinerConclusion ?? concern.examinerConclusion).trim(),
        reportingAssessment: requireOneOf(
          String(body.reportingAssessment || concern.reportingAssessment),
          [...reportingAssessments],
          "reporting assessment",
        ),
        status: "IN_PROGRESS",
        updatedAt: new Date().toISOString(),
      };
      if (!values.title || !values.description)
        return Response.json({ error: "Concern title and description are required" }, { status: 400 });
      await db.update(s.concerns).set(values).where(eq(s.concerns.id, concern.id));
      await concernEvent(concern, who, "ASSESSMENT_UPDATED", "Concern assessment updated", {
        severity: values.severity,
        category: values.category,
        reportingAssessment: values.reportingAssessment,
      });
      await audit(concern.engagementId, who.email, "CONCERN_UPDATED", "concern", String(concern.id), values);
    } else if (action === "addConcernEvent") {
      const concern = await getConcern(Number(body.concernId));
      const eventType = requireOneOf(
          String(body.eventType || "INFORMATION"),
          ["INFORMATION", "MANAGEMENT_RESPONSE", "EXAMINER_ASSESSMENT", "REVIEW_NOTE"],
          "concern update type",
        ),
        eventBody = String(body.body || "").trim();
      if (!eventBody)
        return Response.json({ error: "Update text is required" }, { status: 400 });
      await concernEvent(concern, who, eventType, eventBody);
      await db.update(s.concerns).set({ updatedAt: new Date().toISOString() }).where(eq(s.concerns.id, concern.id));
      await audit(concern.engagementId, who.email, "CONCERN_EVENT_ADDED", "concern", String(concern.id), { eventType });
    } else if (action === "submitConcernForReview") {
      const concern = await getConcern(Number(body.concernId));
      requirePermission(
        ["OPEN", "IN_PROGRESS", "REOPENED"].includes(concern.status),
        "Only an open concern can be submitted for review",
      );
      const errors = validateConcernSubmission({
        ...concern,
        owner: concern.owner,
        examinerConclusion: concern.examinerConclusion,
      });
      if (errors.length)
        return Response.json({ error: errors.join(". ") }, { status: 400 });
      const settings = (await db.select().from(s.practiceSettings).limit(1))[0];
      const inIndependentReviewScope =
        settings?.concernReviewMode !== "HIGH_RISK_ONLY" ||
        ["HIGH", "CRITICAL"].includes(concern.severity);
      const now = new Date().toISOString();
      const hash = await snapshotHash({ ...concern, status: "READY_FOR_REVIEW" });
      await db.update(s.concerns).set({ status: "READY_FOR_REVIEW", submittedBy: who.email, submittedAt: now, updatedAt: now }).where(eq(s.concerns.id, concern.id));
      await concernEvent(concern, who, "SUBMITTED", "Concern submitted for review", {
        snapshotHash: hash,
        reviewMode: settings?.concernReviewMode ?? "EXAMINER_JUDGEMENT",
        independentClosureRequired:
          Boolean(settings?.requireIndependentConcernClosure) &&
          inIndependentReviewScope,
      });
      await audit(concern.engagementId, who.email, "CONCERN_SUBMITTED", "concern", String(concern.id), { hash });
    } else if (action === "reviewConcern") {
      const concern = await getConcern(Number(body.concernId));
      requirePermission(concern.status === "READY_FOR_REVIEW", "Concern is not ready for review");
      const decision = requireOneOf(
          String(body.decision || ""),
          ["CLOSE", "FURTHER_WORK_REQUIRED"],
          "review decision",
        ),
        reviewConclusion = String(body.reviewConclusion || "").trim();
      if (!reviewConclusion)
        return Response.json({ error: "A review conclusion is required" }, { status: 400 });
      const settings = (await db.select().from(s.practiceSettings).limit(1))[0];
      const inIndependentReviewScope =
        settings?.concernReviewMode !== "HIGH_RISK_ONLY" ||
        ["HIGH", "CRITICAL"].includes(concern.severity);
      if (
        decision === "CLOSE" &&
        settings?.requireIndependentConcernClosure &&
        inIndependentReviewScope
      )
        requirePermission(
          concern.createdBy.toLowerCase() !== who.email.toLowerCase(),
          "Practice policy requires an independent person to close this concern",
        );
      const now = new Date().toISOString();
      const status = decision === "CLOSE" ? "CLOSED" : "IN_PROGRESS";
      const hash = await snapshotHash({ ...concern, status, reviewConclusion, reviewedBy: who.email, reviewedAt: now });
      await db.update(s.concerns).set({
        status,
        reviewConclusion,
        reviewedBy: who.email,
        reviewedAt: now,
        closureHash: decision === "CLOSE" ? hash : concern.closureHash,
        resolvedBy: decision === "CLOSE" ? who.name : concern.resolvedBy,
        resolvedAt: decision === "CLOSE" ? now : concern.resolvedAt,
        resolution: decision === "CLOSE" ? concern.examinerConclusion : concern.resolution,
        updatedAt: now,
      }).where(eq(s.concerns.id, concern.id));
      await concernEvent(concern, who, decision === "CLOSE" ? "CLOSED" : "FURTHER_WORK", reviewConclusion, { snapshotHash: hash });
      await audit(concern.engagementId, who.email, decision === "CLOSE" ? "CONCERN_CLOSED" : "CONCERN_FURTHER_WORK", "concern", String(concern.id), { hash });
    } else if (action === "reopenConcern") {
      const concern = await getConcern(Number(body.concernId));
      requirePermission(["CLOSED", "RESOLVED"].includes(concern.status), "Only a closed concern can be reopened");
      const reason = String(body.reason || "").trim();
      if (!reason)
        return Response.json({ error: "A reopening reason is required" }, { status: 400 });
      const now = new Date().toISOString();
      await db.update(s.concerns).set({ status: "REOPENED", reopenedBy: who.email, reopenedAt: now, reopenReason: reason, updatedAt: now }).where(eq(s.concerns.id, concern.id));
      await concernEvent(concern, who, "REOPENED", reason);
      await audit(concern.engagementId, who.email, "CONCERN_REOPENED", "concern", String(concern.id), { reason });
    } else if (action === "resolveConcern") {
      return Response.json(
        { error: "Use the controlled submit, review and close workflow" },
        { status: 409 },
      );
    } else if (action === "updatePracticeSettings") {
      const values = {
        concernReviewMode: requireOneOf(
          String(body.concernReviewMode || "EXAMINER_JUDGEMENT"),
          ["ALL", "HIGH_RISK_ONLY", "EXAMINER_JUDGEMENT"],
          "concern review mode",
        ),
        requireIndependentConcernClosure: Boolean(body.requireIndependentConcernClosure),
        allowProcedureSelfReview: Boolean(body.allowProcedureSelfReview),
        defaultQualityReviewMode: requireOneOf(
          String(body.defaultQualityReviewMode || "NONE"),
          ["NONE", "SECOND_REVIEW", "HOT_FILE", "COLD_FILE"],
          "default quality review mode",
        ),
        fileLockDeadlineDays: Number(body.fileLockDeadlineDays),
        retentionYears: Number(body.retentionYears),
        updatedBy: who.email,
        updatedAt: new Date().toISOString(),
      };
      if (!Number.isInteger(values.fileLockDeadlineDays) || values.fileLockDeadlineDays < 1 || values.fileLockDeadlineDays > 365)
        return Response.json({ error: "File lock deadline must be between 1 and 365 days" }, { status: 400 });
      if (!Number.isInteger(values.retentionYears) || values.retentionYears < 1 || values.retentionYears > 25)
        return Response.json({ error: "Retention period must be between 1 and 25 years" }, { status: 400 });
      await db
        .insert(s.practiceSettings)
        .values({ id: 1, ...values })
        .onConflictDoUpdate({ target: s.practiceSettings.id, set: values });
      await audit(null, who.email, "PRACTICE_SETTINGS_UPDATED", "practice_settings", "1", values);
    } else if (action === "lockEngagement") {
      const id = Number(body.engagementId);
      const row = await requireOpen(id);
      const tasks = await db
          .select()
          .from(s.tasks)
          .where(eq(s.tasks.engagementId, id)),
        procedures = await db
          .select()
          .from(s.procedures)
          .innerJoin(s.tasks, eq(s.procedures.taskId, s.tasks.id))
          .where(eq(s.tasks.engagementId, id)),
        notes = await db
          .select()
          .from(s.reviewNotes)
          .where(eq(s.reviewNotes.engagementId, id)),
        concerns = await db
          .select()
          .from(s.concerns)
          .where(eq(s.concerns.engagementId, id)),
        tbVersions = await db
          .select()
          .from(s.tbImports)
          .where(eq(s.tbImports.engagementId, id));
      const eligibility = await engagementEligibility(row);
      const directionsReady = tasks
        .filter((task) => !task.isCustom)
        .every((task) => task.status === "REVIEWED");
      const proceduresReady = procedures.every(
          (x) =>
            x.procedures.status === "REVIEWED" &&
            (x.procedures.applicability !== "NOT_APPLICABLE" ||
              Boolean(x.procedures.applicabilityRationale)),
        ),
        latestTb = tbVersions.sort((a, b) => b.version - a.version)[0],
        tbReady =
          row.accountingBasis !== "Accruals" || latestTb?.status === "REVIEWED",
        qualityReady =
          row.qualityReviewMode === "NONE" ||
          row.qualityReviewStatus === "COMPLETED";
      if (
        eligibility.scrutiny !== "INDEPENDENT_EXAMINATION" ||
        !directionsReady ||
        !proceduresReady ||
        !tbReady ||
        notes.some((n) => n.status !== "CLEARED") ||
        concerns.some((c) => !["CLOSED", "RESOLVED"].includes(c.status)) ||
        !row.trusteeApproved ||
        !row.materialSignificanceAssessed ||
        !row.reportConclusion ||
        !qualityReady
      )
        return Response.json(
          {
            error:
              "The annual file cannot be locked until eligibility, applicable procedures, TB analysis, concerns, review points, quality review and reporting gates are complete",
          },
          { status: 409 },
        );
      const now = new Date().toISOString(),
        hash = await snapshotHash({
          row,
          tasks,
          procedures,
          notes,
          concerns,
          latestTb,
        });
      await db
        .update(s.engagements)
        .set({
          lockedAt: now,
          lockedBy: who.email,
          status: "SIGNED",
          updatedAt: now,
        })
        .where(eq(s.engagements.id, id));
      await db.insert(s.fileLockEvents).values({
        engagementId: id,
        action: "LOCKED",
        reason: "Completion controls satisfied",
        snapshotHash: hash,
        actorEmail: who.email,
      });
      await audit(
        id,
        who.email,
        "ANNUAL_FILE_LOCKED",
        "engagement",
        String(id),
        { hash },
      );
    } else if (action === "reopenEngagement") {
      const id = Number(body.engagementId),
        reason = String(body.reason || "").trim();
      if (!reason)
        return Response.json(
          { error: "A documented reopening reason is required" },
          { status: 400 },
        );
      const row = (
        await db
          .select()
          .from(s.engagements)
          .where(eq(s.engagements.id, id))
          .limit(1)
      )[0];
      if (!row?.lockedAt)
        return Response.json(
          { error: "The annual file is not locked" },
          { status: 400 },
        );
      const now = new Date().toISOString(),
        hash = await snapshotHash({ previousLock: row.lockedAt, reason });
      await db
        .update(s.engagements)
        .set({
          lockedAt: null,
          lockedBy: null,
          reopenedAt: now,
          reopenedBy: who.email,
          reopenReason: reason,
          status: "COMPLETION",
          updatedAt: now,
        })
        .where(eq(s.engagements.id, id));
      await db.insert(s.fileLockEvents).values({
        engagementId: id,
        action: "REOPENED",
        reason,
        snapshotHash: hash,
        actorEmail: who.email,
      });
      await audit(
        id,
        who.email,
        "ANNUAL_FILE_REOPENED",
        "engagement",
        String(id),
        { reason, hash },
      );
    } else if (action === "setReportConclusion") {
      const id = Number(body.engagementId);
      await requireOpen(id);
      const conclusion = String(body.conclusion || "");
      if (
        ![
          "UNMODIFIED",
          "RECORDS_CONCERN",
          "ACCOUNTS_CONCERN",
          "OTHER_MATTER",
        ].includes(conclusion)
      )
        return Response.json(
          { error: "Select a valid report conclusion" },
          { status: 400 },
        );
      const concerns = await db
        .select()
        .from(s.concerns)
        .where(eq(s.concerns.engagementId, id));
      const compatibility = conclusionCompatibility(conclusion, concerns);
      if (!compatibility.compatible)
        return Response.json(
          { error: compatibility.reason },
          { status: 409 },
        );
      await db
        .update(s.engagements)
        .set({
          reportConclusion: conclusion,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(s.engagements.id, id));
      await audit(
        id,
        who.email,
        "REPORT_CONCLUSION_SELECTED",
        "engagement",
        String(id),
        { conclusion },
      );
    } else if (action === "updateGate") {
      const id = Number(body.engagementId);
      await requireOpen(id);
      const field = String(body.field);
      if (field === "trusteeApproved")
        await db
          .update(s.engagements)
          .set({
            trusteeApproved: Boolean(body.value),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(s.engagements.id, id));
      else if (field === "materialSignificanceAssessed")
        await db
          .update(s.engagements)
          .set({
            materialSignificanceAssessed: Boolean(body.value),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(s.engagements.id, id));
      else return Response.json({ error: "Unknown gate" }, { status: 400 });
      await audit(
        id,
        who.email,
        "COMPLETION_GATE_UPDATED",
        "engagement",
        String(id),
        { field, value: Boolean(body.value) },
      );
    } else if (action === "moveToReview") {
      const id = Number(body.engagementId);
      await requireOpen(id);
      const tasks = await db
        .select()
        .from(s.tasks)
        .where(eq(s.tasks.engagementId, id));
      if (
        !tasks.length ||
        tasks.some((t) => t.status !== "PREPARED" && t.status !== "REVIEWED")
      )
        return Response.json(
          {
            error:
              "Every workpaper must be prepared before the engagement moves to review",
          },
          { status: 400 },
        );
      await db
        .update(s.engagements)
        .set({ status: "REVIEW", updatedAt: new Date().toISOString() })
        .where(eq(s.engagements.id, id));
      await audit(
        id,
        who.email,
        "ENGAGEMENT_MOVED_TO_REVIEW",
        "engagement",
        String(id),
        {},
      );
    } else if (action === "refresh") {
      // Returns the latest persistent state after a file operation.
    } else return Response.json({ error: "Unknown action" }, { status: 400 });
    return json(await getState(who));
  } catch (error) {
    return errorResponse(error, "Unable to save change");
  }
}

const practiceActions = new Set([
  "createClient",
  "updateClient",
  "createEngagement",
  "updateEngagement",
  "addTeamMember",
  "updateTeamMember",
  "addTrustee",
  "updateTrustee",
  "addClientUser",
  "updateClientUser",
  "updateJurisdiction",
  "createJurisdictionRuleSet",
  "updateJurisdictionRuleSet",
  "publishJurisdictionRuleSet",
  "saveAndPublishJurisdictionRuleSet",
  "updatePracticeSettings",
  "createOrganisationType",
  "updateOrganisationType",
]);
const reviewActions = new Set([
  "createReviewNote",
  "resolveNote",
  "reopenNote",
  "resolveConcern",
  "reviewConcern",
  "reopenConcern",
  "lockEngagement",
  "reopenEngagement",
  "setReportConclusion",
  "updateQualityReview",
  "updateGate",
  "moveToReview",
]);

async function authoriseAction(
  principal: Principal,
  action: string,
  body: Record<string, unknown>,
): Promise<void> {
  if (principal.kind === "CLIENT") {
    requirePermission(
      [
        "addClientReply",
        "createConversation",
        "sendConversationMessage",
        "markConversationRead",
        "refresh",
      ].includes(action),
      "Client accounts may only use authorised portal collaboration actions",
    );
    if (action === "addClientReply" || action === "createConversation") {
      const engagementId = Number(body.engagementId),
        engagement = (
          await getDb()
            .select()
            .from(s.engagements)
            .where(eq(s.engagements.id, engagementId))
            .limit(1)
        )[0];
      requirePermission(
        Boolean(engagement) &&
          canRespondForClient(principal, engagement.clientId),
        "This engagement is not available to the signed-in client",
      );
    }
    return;
  }
  if (practiceActions.has(action))
    requirePermission(
      canManagePractice(principal),
      "Practice administrator permission is required",
    );
  else if (reviewActions.has(action))
    requirePermission(canReview(principal), "Reviewer permission is required");
  else
    requirePermission(
      canPrepare(principal),
      "Engagement team permission is required",
    );
}

async function requireDifferentSigner(
  principal: Principal,
  engagementId: number,
  taskId: number | null,
  procedureId: number | null,
  type: string,
): Promise<void> {
  requirePermission(canReview(principal), "Reviewer permission is required");
  const rows = await getDb()
    .select()
    .from(s.signoffs)
    .where(eq(s.signoffs.engagementId, engagementId))
    .orderBy(desc(s.signoffs.id));
  const prepared = rows.find(
    (row) =>
      row.type === type &&
      row.taskId === taskId &&
      row.procedureId === procedureId,
  );
  requirePermission(
    Boolean(prepared),
    "A recorded preparer sign-off is required before review",
  );
  const settings = (await getDb().select().from(s.practiceSettings).limit(1))[0];
  if (settings?.allowProcedureSelfReview) return;
  requirePermission(
    prepared!.signedBy.toLowerCase() !== principal.email.toLowerCase(),
    "The preparer cannot review their own work",
  );
}

function requireInternalRole(value: string): string {
  const role = normaliseRole(value);
  requirePermission(
    role !== null &&
      ["ADMIN", "INDEPENDENT_EXAMINER", "REVIEWER", "PREPARER"].includes(role),
    "Select a valid internal role",
  );
  return role;
}

function requireClientRole(value: string): string {
  const role = normaliseRole(value);
  requirePermission(
    role !== null &&
      ["PORTAL_ADMIN", "CONTRIBUTOR", "READ_ONLY"].includes(role),
    "Select a valid client portal role",
  );
  return role;
}
