import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import {
  actor,
  engagementEligibility,
  prepareAuditInsert,
  snapshotHash,
} from "@/lib/server-data";
import {
  concernCategories,
  conclusionCompatibility,
  reportingAssessments,
  validateConcernSubmission,
} from "@/lib/concerns";
import {
  requirePermission,
  type Principal,
} from "@/lib/authz";
import { requireOneOf } from "@/lib/validation";
import { requireOpenEngagement as requireOpen } from "@/lib/state-actions/engagements";

export type StateActionResult = Response | true | false;

function prepareConcernEvent(
  concern: typeof s.concerns.$inferSelect,
  who: Principal,
  eventType: string,
  body: string,
  metadata: Record<string, unknown> = {},
) {
  return getDb().insert(s.concernEvents).values({
    tenantId: who.tenantId,
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
  const who = await actor();
  const concern = (
    await getDb()
      .select()
      .from(s.concerns)
      .where(and(eq(s.concerns.id, id), eq(s.concerns.tenantId, who.tenantId)))
      .limit(1)
  )[0];
  if (!concern) throw new Error("Concern not found");
  await requireOpen(concern.engagementId);
  return concern;
}

async function nextConcernReference(engagementId: number) {
  const who = await actor();
  const db = getDb();
  const engagement = (
    await db
      .select({ publicId: s.engagements.publicId })
      .from(s.engagements)
      .where(
        and(
          eq(s.engagements.id, engagementId),
          eq(s.engagements.tenantId, who.tenantId),
        ),
      )
      .limit(1)
  )[0];
  if (!engagement) throw new Error("Engagement not found");
  const rows = await db
    .select({ reference: s.concerns.reference })
    .from(s.concerns)
    .where(
      and(
        eq(s.concerns.engagementId, engagementId),
        eq(s.concerns.tenantId, who.tenantId),
      ),
    );
  const next =
    Math.max(
      0,
      ...rows.map((row) => Number(row.reference.match(/(\d+)$/)?.[1] ?? 0)),
    ) + 1;
  return `FND-${engagement.publicId.slice(0, 8).toUpperCase()}-${String(next).padStart(3, "0")}`;
}

const actions = new Set([
  "createConcern",
  "updateConcern",
  "addConcernEvent",
  "submitConcernForReview",
  "reviewConcern",
  "reopenConcern",
  "resolveConcern",
  "lockEngagement",
  "reopenEngagement",
  "setReportConclusion",
  "updateGate",
  "moveToReview",
]);

export async function handleConcernLockAction(
  action: string,
  body: Record<string, unknown>,
  who: Principal,
): Promise<StateActionResult> {
  if (!actions.has(action)) return false;
  const db = getDb();
    if (action === "createConcern") {
      const engagementId = Number(body.engagementId);
      await requireOpen(engagementId);
      const title = String(body.title || "").trim(),
        description = String(body.description || "").trim();
      if (!title || !description)
        return Response.json(
          { error: "Concern title and description are required" },
          { status: 400 },
        );
      const publicId = crypto.randomUUID();
      const reference = await nextConcernReference(engagementId);
      const category = requireOneOf(
        String(body.category || "GENERAL"),
        [...concernCategories],
        "concern category",
      );
      const severity = requireOneOf(
        String(body.severity || "MEDIUM"),
        ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
        "concern severity",
      );
      const concernInsert = db
        .insert(s.concerns)
        .values({
          tenantId: who.tenantId,
          publicId,
          engagementId,
          reference,
          sourceType: "MANUAL",
          category,
          title,
          description,
          severity,
          owner: String(body.owner || who.name).trim(),
          createdBy: who.email,
        });
      const eventInsert = db.insert(s.concernEvents).values({
        tenantId: who.tenantId,
        concernId: sql<number>`(SELECT id FROM ${s.concerns} WHERE ${s.concerns.tenantId} = ${who.tenantId} AND ${s.concerns.publicId} = ${publicId})`,
        engagementId,
        eventType: "CREATED",
        body: description,
        metadata: "{}",
        actorEmail: who.email,
        actorName: who.name,
      });
      const { statement: concernAudit } = await prepareAuditInsert(
        who.tenantId,
        engagementId,
        who.email,
        "CONCERN_CREATED",
        "concern",
        publicId,
        { reference },
      );
      await db.batch([concernInsert, eventInsert, concernAudit]);
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
      const concernUpdate = db
        .update(s.concerns)
        .set(values)
        .where(and(eq(s.concerns.id, concern.id), eq(s.concerns.tenantId, who.tenantId)));
      const eventInsert = prepareConcernEvent(concern, who, "ASSESSMENT_UPDATED", "Concern assessment updated", {
        severity: values.severity,
        category: values.category,
        reportingAssessment: values.reportingAssessment,
      });
      const { statement: concernAudit } = await prepareAuditInsert(
        who.tenantId,
        concern.engagementId,
        who.email,
        "CONCERN_UPDATED",
        "concern",
        String(concern.id),
        values,
      );
      await db.batch([concernUpdate, eventInsert, concernAudit]);
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
      const eventInsert = prepareConcernEvent(concern, who, eventType, eventBody);
      const concernUpdate = db
        .update(s.concerns)
        .set({ updatedAt: new Date().toISOString() })
        .where(and(eq(s.concerns.id, concern.id), eq(s.concerns.tenantId, who.tenantId)));
      const { statement: concernAudit } = await prepareAuditInsert(
        who.tenantId,
        concern.engagementId,
        who.email,
        "CONCERN_EVENT_ADDED",
        "concern",
        String(concern.id),
        { eventType },
      );
      await db.batch([eventInsert, concernUpdate, concernAudit]);
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
      const settings = (
        await db
          .select()
          .from(s.practiceSettings)
          .where(eq(s.practiceSettings.tenantId, who.tenantId))
          .limit(1)
      )[0];
      const inIndependentReviewScope =
        settings?.concernReviewMode !== "HIGH_RISK_ONLY" ||
        ["HIGH", "CRITICAL"].includes(concern.severity);
      const now = new Date().toISOString();
      const hash = await snapshotHash({ ...concern, status: "READY_FOR_REVIEW" });
      const concernUpdate = db
        .update(s.concerns)
        .set({ status: "READY_FOR_REVIEW", submittedBy: who.email, submittedAt: now, updatedAt: now })
        .where(and(eq(s.concerns.id, concern.id), eq(s.concerns.tenantId, who.tenantId)));
      const eventInsert = prepareConcernEvent(concern, who, "SUBMITTED", "Concern submitted for review", {
        snapshotHash: hash,
        reviewMode: settings?.concernReviewMode ?? "EXAMINER_JUDGEMENT",
        independentClosureRequired:
          Boolean(settings?.requireIndependentConcernClosure) &&
          inIndependentReviewScope,
      });
      const { statement: concernAudit } = await prepareAuditInsert(
        who.tenantId,
        concern.engagementId,
        who.email,
        "CONCERN_SUBMITTED",
        "concern",
        String(concern.id),
        { hash },
      );
      await db.batch([concernUpdate, eventInsert, concernAudit]);
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
      const settings = (
        await db
          .select()
          .from(s.practiceSettings)
          .where(eq(s.practiceSettings.tenantId, who.tenantId))
          .limit(1)
      )[0];
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
      const concernUpdate = db
        .update(s.concerns)
        .set({
          status,
          reviewConclusion,
          reviewedBy: who.email,
          reviewedAt: now,
          closureHash: decision === "CLOSE" ? hash : concern.closureHash,
          resolvedBy: decision === "CLOSE" ? who.name : concern.resolvedBy,
          resolvedAt: decision === "CLOSE" ? now : concern.resolvedAt,
          resolution: decision === "CLOSE" ? concern.examinerConclusion : concern.resolution,
          updatedAt: now,
        })
        .where(and(eq(s.concerns.id, concern.id), eq(s.concerns.tenantId, who.tenantId)));
      const eventInsert = prepareConcernEvent(
        concern,
        who,
        decision === "CLOSE" ? "CLOSED" : "FURTHER_WORK",
        reviewConclusion,
        { snapshotHash: hash },
      );
      const { statement: concernAudit } = await prepareAuditInsert(
        who.tenantId,
        concern.engagementId,
        who.email,
        decision === "CLOSE" ? "CONCERN_CLOSED" : "CONCERN_FURTHER_WORK",
        "concern",
        String(concern.id),
        { hash },
      );
      await db.batch([concernUpdate, eventInsert, concernAudit]);
    } else if (action === "reopenConcern") {
      const concern = await getConcern(Number(body.concernId));
      requirePermission(["CLOSED", "RESOLVED"].includes(concern.status), "Only a closed concern can be reopened");
      const reason = String(body.reason || "").trim();
      if (!reason)
        return Response.json({ error: "A reopening reason is required" }, { status: 400 });
      const now = new Date().toISOString();
      const concernUpdate = db
        .update(s.concerns)
        .set({ status: "REOPENED", reopenedBy: who.email, reopenedAt: now, reopenReason: reason, updatedAt: now })
        .where(and(eq(s.concerns.id, concern.id), eq(s.concerns.tenantId, who.tenantId)));
      const eventInsert = prepareConcernEvent(concern, who, "REOPENED", reason);
      const { statement: concernAudit } = await prepareAuditInsert(
        who.tenantId,
        concern.engagementId,
        who.email,
        "CONCERN_REOPENED",
        "concern",
        String(concern.id),
        { reason },
      );
      await db.batch([concernUpdate, eventInsert, concernAudit]);
    } else if (action === "resolveConcern") {
      return Response.json(
        { error: "Use the controlled submit, review and close workflow" },
        { status: 409 },
      );
    }
    if (action === "lockEngagement") {
      const id = Number(body.engagementId);
      const row = await requireOpen(id);
      const tasks = await db
          .select()
          .from(s.tasks)
          .where(and(eq(s.tasks.engagementId, id), eq(s.tasks.tenantId, who.tenantId))),
        procedures = await db
          .select()
          .from(s.procedures)
          .innerJoin(
            s.tasks,
            and(
              eq(s.procedures.taskId, s.tasks.id),
              eq(s.procedures.tenantId, s.tasks.tenantId),
            ),
          )
          .where(
            and(
              eq(s.tasks.engagementId, id),
              eq(s.tasks.tenantId, who.tenantId),
              eq(s.procedures.tenantId, who.tenantId),
            ),
          ),
        notes = await db
          .select()
          .from(s.reviewNotes)
          .where(and(eq(s.reviewNotes.engagementId, id), eq(s.reviewNotes.tenantId, who.tenantId))),
        concerns = await db
          .select()
          .from(s.concerns)
          .where(and(eq(s.concerns.engagementId, id), eq(s.concerns.tenantId, who.tenantId))),
        tbVersions = await db
          .select()
          .from(s.tbImports)
          .where(and(eq(s.tbImports.engagementId, id), eq(s.tbImports.tenantId, who.tenantId)));
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
      const lockUpdate = db.update(s.engagements).set({
          lockedAt: now,
          lockedBy: who.email,
          status: "SIGNED",
          updatedAt: now,
          rowVersion: sql`${s.engagements.rowVersion} + 1`,
        }).where(and(eq(s.engagements.id, id), eq(s.engagements.tenantId, who.tenantId)));
      const lockEvent = db.insert(s.fileLockEvents).values({
        tenantId: who.tenantId,
        engagementId: id,
        action: "LOCKED",
        reason: "Completion controls satisfied",
        snapshotHash: hash,
        actorEmail: who.email,
      });
      const { statement: lockAudit } = await prepareAuditInsert(
        who.tenantId,
        id,
        who.email,
        "ANNUAL_FILE_LOCKED",
        "engagement",
        String(id),
        { hash },
      );
      await db.batch([lockUpdate, lockEvent, lockAudit]);
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
          .where(and(eq(s.engagements.id, id), eq(s.engagements.tenantId, who.tenantId)))
          .limit(1)
      )[0];
      if (!row?.lockedAt)
        return Response.json(
          { error: "The annual file is not locked" },
          { status: 400 },
        );
      if (Number(body.rowVersion) !== row.rowVersion)
        return Response.json(
          { error: "This annual file changed after it was loaded. Refresh before reopening it." },
          { status: 409 },
        );
      const now = new Date().toISOString(),
        hash = await snapshotHash({ previousLock: row.lockedAt, reason });
      const reopenUpdate = db.update(s.engagements).set({
          lockedAt: null,
          lockedBy: null,
          reopenedAt: now,
          reopenedBy: who.email,
          reopenReason: reason,
          status: "COMPLETION",
          updatedAt: now,
          rowVersion: sql`${s.engagements.rowVersion} + 1`,
        }).where(and(eq(s.engagements.id, id), eq(s.engagements.tenantId, who.tenantId)));
      const reopenEvent = db.insert(s.fileLockEvents).values({
        tenantId: who.tenantId,
        engagementId: id,
        action: "REOPENED",
        reason,
        snapshotHash: hash,
        actorEmail: who.email,
      });
      const { statement: reopenAudit } = await prepareAuditInsert(
        who.tenantId,
        id,
        who.email,
        "ANNUAL_FILE_REOPENED",
        "engagement",
        String(id),
        { reason, hash },
      );
      await db.batch([reopenUpdate, reopenEvent, reopenAudit]);
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
        .where(and(eq(s.concerns.engagementId, id), eq(s.concerns.tenantId, who.tenantId)));
      const compatibility = conclusionCompatibility(conclusion, concerns);
      if (!compatibility.compatible)
        return Response.json(
          { error: compatibility.reason },
          { status: 409 },
        );
      const conclusionUpdate = db
        .update(s.engagements)
        .set({
          reportConclusion: conclusion,
          updatedAt: new Date().toISOString(),
        })
        .where(and(eq(s.engagements.id, id), eq(s.engagements.tenantId, who.tenantId)));
      const { statement: conclusionAudit } = await prepareAuditInsert(
        who.tenantId,
        id,
        who.email,
        "REPORT_CONCLUSION_SELECTED",
        "engagement",
        String(id),
        { conclusion },
      );
      await db.batch([conclusionUpdate, conclusionAudit]);
    } else if (action === "updateGate") {
      const id = Number(body.engagementId);
      await requireOpen(id);
      const field = String(body.field);
      let gateUpdate;
      if (field === "trusteeApproved")
        gateUpdate = db
          .update(s.engagements)
          .set({
            trusteeApproved: Boolean(body.value),
            updatedAt: new Date().toISOString(),
          })
          .where(and(eq(s.engagements.id, id), eq(s.engagements.tenantId, who.tenantId)));
      else if (field === "materialSignificanceAssessed")
        gateUpdate = db
          .update(s.engagements)
          .set({
            materialSignificanceAssessed: Boolean(body.value),
            updatedAt: new Date().toISOString(),
          })
          .where(and(eq(s.engagements.id, id), eq(s.engagements.tenantId, who.tenantId)));
      else return Response.json({ error: "Unknown gate" }, { status: 400 });
      const { statement: gateAudit } = await prepareAuditInsert(
        who.tenantId,
        id,
        who.email,
        "COMPLETION_GATE_UPDATED",
        "engagement",
        String(id),
        { field, value: Boolean(body.value) },
      );
      await db.batch([gateUpdate, gateAudit]);
    } else if (action === "moveToReview") {
      const id = Number(body.engagementId);
      await requireOpen(id);
      const tasks = await db
        .select()
        .from(s.tasks)
        .where(and(eq(s.tasks.engagementId, id), eq(s.tasks.tenantId, who.tenantId)));
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
      const reviewUpdate = db
        .update(s.engagements)
        .set({ status: "REVIEW", updatedAt: new Date().toISOString() })
        .where(and(eq(s.engagements.id, id), eq(s.engagements.tenantId, who.tenantId)));
      const { statement: reviewAudit } = await prepareAuditInsert(
        who.tenantId,
        id,
        who.email,
        "ENGAGEMENT_MOVED_TO_REVIEW",
        "engagement",
        String(id),
        {},
      );
      await db.batch([reviewUpdate, reviewAudit]);
    }
  return true;
}
