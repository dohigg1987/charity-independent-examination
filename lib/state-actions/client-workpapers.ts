import { and, desc, eq, max, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import {
  applicableRuleSet,
  prepareAuditInsert,
  snapshotHash,
} from "@/lib/server-data";
import { programmeForJurisdiction } from "@/lib/work-programme";
import {
  canReview,
  requirePermission,
  type Principal,
} from "@/lib/authz";
import {
  optionalEmail,
  requireIsoDate,
  requireNonNegativeNumber,
  requireOneOf,
} from "@/lib/validation";
import { requireOpenEngagement as requireOpen } from "@/lib/state-actions/engagements";
import { randomInternalId } from "@/lib/state-actions/communications";

export type StateActionResult = Response | true | false;

async function nextConcernReference(engagementId: number, who: Principal) {
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
    .where(
      and(
        eq(s.signoffs.engagementId, engagementId),
        eq(s.signoffs.tenantId, principal.tenantId),
      ),
    )
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
  const settings = (
    await getDb()
      .select()
      .from(s.practiceSettings)
      .where(eq(s.practiceSettings.tenantId, principal.tenantId))
      .limit(1)
  )[0];
  if (settings?.allowProcedureSelfReview) return;
  requirePermission(
    prepared!.signedBy.toLowerCase() !== principal.email.toLowerCase(),
    "The preparer cannot review their own work",
  );
}

const actions = new Set([
  "createClient",
  "updateClient",
  "createEngagement",
  "updateEngagement",
  "createTask",
  "saveTask",
  "saveProcedure",
]);

export async function handleClientWorkpaperAction(
  action: string,
  body: Record<string, unknown>,
  who: Principal,
): Promise<StateActionResult> {
  if (!actions.has(action)) return false;
  const db = getDb();
    if (action === "createClient") {
      if (!body.name || !body.charityNumber)
        return Response.json(
          { error: "Name and charity number are required" },
          { status: 400 },
        );
      const publicId = crypto.randomUUID();
      const name = String(body.name).trim();
      const clientInsert = db
        .insert(s.clients)
        .values({
          tenantId: who.tenantId,
          publicId,
          name,
          charityNumber: String(body.charityNumber).trim(),
          legalForm: String(body.legalForm || "CIO"),
          contactName: String(body.contactName || ""),
          contactEmail: optionalEmail(String(body.contactEmail || "")),
        });
      const { statement: clientAudit } = await prepareAuditInsert(
        who.tenantId,
        null,
        who.email,
        "CLIENT_CREATED",
        "client",
        publicId,
        { name },
      );
      await db.batch([clientInsert, clientAudit]);
    } else if (action === "updateClient") {
      const id = Number(body.clientId);
      const row = (
        await db.select().from(s.clients).where(and(eq(s.clients.id, id), eq(s.clients.tenantId, who.tenantId))).limit(1)
      )[0];
      if (!row)
        return Response.json({ error: "Client not found" }, { status: 404 });
      const clientUpdate = db
        .update(s.clients)
        .set({
          name: String(body.name || row.name).trim(),
          charityNumber: String(body.charityNumber || row.charityNumber).trim(),
          legalForm: String(body.legalForm || row.legalForm),
          contactName: String(body.contactName || row.contactName),
          contactEmail: optionalEmail(
            String(body.contactEmail ?? row.contactEmail),
          ),
          status: requireOneOf(
            String(body.status || row.status),
            ["ACTIVE", "INACTIVE"],
            "client status",
          ),
        })
        .where(and(eq(s.clients.id, id), eq(s.clients.tenantId, who.tenantId)));
      const { statement: clientAudit } = await prepareAuditInsert(
        who.tenantId,
        null,
        who.email,
        "CLIENT_UPDATED",
        "client",
        String(id),
        { name: body.name || row.name },
      );
      await db.batch([clientUpdate, clientAudit]);
    } else if (action === "createEngagement") {
      const clientId = Number(body.clientId);
      if (!clientId || !body.periodEnd)
        return Response.json(
          { error: "Client and reporting date are required" },
          { status: 400 },
        );
      const client = (
        await db
          .select({ id: s.clients.id })
          .from(s.clients)
          .where(
            and(
              eq(s.clients.id, clientId),
              eq(s.clients.tenantId, who.tenantId),
            ),
          )
          .limit(1)
      )[0];
      if (!client)
        return Response.json({ error: "Client not found" }, { status: 404 });
      const jurisdiction = String(body.jurisdiction || "ENGLAND_WALES");
      const periodEnd = requireIsoDate(String(body.periodEnd), "reporting date");
      const periodStart = requireIsoDate(String(body.periodStart), "reporting period start date");
      if (periodStart > periodEnd)
        return Response.json({ error: "Period start cannot be after period end" }, { status: 400 });
      const { rule } = await applicableRuleSet(jurisdiction, periodEnd, periodStart);
      const practicePolicy = (await db.select().from(s.practiceSettings).where(eq(s.practiceSettings.tenantId, who.tenantId)).limit(1))[0];
      const defaultQualityReviewMode =
        practicePolicy?.defaultQualityReviewMode ?? "NONE";
      const engagementId = randomInternalId();
      const engagementPublicId = crypto.randomUUID();
      const engagementInsert = db.insert(s.engagements).values({
          id: engagementId,
          tenantId: who.tenantId,
          publicId: engagementPublicId,
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
        });
      const programme = programmeForJurisdiction(jurisdiction);
      const taskRows = programme.map((direction) => ({
        id: randomInternalId(),
        tenantId: who.tenantId,
        publicId: crypto.randomUUID(),
        engagementId,
        direction: direction.id,
        title: direction.title,
        objective: direction.objective,
        phase: direction.phase,
        guidance: `Applies to: ${direction.applies}. Document the work performed, evidence obtained, significant judgements and conclusion in sufficient detail to support the independent examination.`,
      }));
      const procedureRows = taskRows.flatMap((task, taskIndex) =>
        programme[taskIndex].procedures.map((text, index) => ({
            id: randomInternalId(),
            tenantId: who.tenantId,
            publicId: crypto.randomUUID(),
            taskId: task.id,
            sequence: index + 1,
            text,
          })),
      );
      const { statement: engagementAudit } = await prepareAuditInsert(
        who.tenantId,
        engagementId,
        who.email,
        "ENGAGEMENT_CREATED",
        "engagement",
        engagementPublicId,
        { clientId, periodEnd: body.periodEnd },
      );
      await db.batch([
        engagementInsert,
        db.insert(s.tasks).values(taskRows),
        db.insert(s.procedures).values(procedureRows),
        engagementAudit,
      ]);
    } else if (action === "updateEngagement") {
      const id = Number(body.engagementId);
      const row = (
        await db
          .select()
          .from(s.engagements)
          .where(and(eq(s.engagements.id, id), eq(s.engagements.tenantId, who.tenantId)))
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
      const engagementUpdate = db
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
        .where(and(eq(s.engagements.id, id), eq(s.engagements.tenantId, who.tenantId)));
      const { statement: engagementAudit } = await prepareAuditInsert(
        who.tenantId,
        id,
        who.email,
        "ENGAGEMENT_UPDATED",
        "engagement",
        String(id),
        { status: body.status || row.status },
      );
      await db.batch([engagementUpdate, engagementAudit]);
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
        .where(and(eq(s.tasks.engagementId, engagementId), eq(s.tasks.tenantId, who.tenantId)));
      const direction = Math.max(13, ...existing.map((t) => t.direction)) + 1;
      const publicId = crypto.randomUUID();
      const taskInsert = db
        .insert(s.tasks)
        .values({
          tenantId: who.tenantId,
          publicId,
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
        });
      const procedureLines = String(body.procedures || "")
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean);
      const taskId = sql<number>`(SELECT id FROM ${s.tasks} WHERE ${s.tasks.tenantId} = ${who.tenantId} AND ${s.tasks.publicId} = ${publicId})`;
      const procedureInsert = procedureLines.length
        ? db.insert(s.procedures).values(
          procedureLines.map((text, index) => ({
            tenantId: who.tenantId,
            taskId,
            sequence: index + 1,
            text,
          })),
        )
        : null;
      const { statement: taskAudit } = await prepareAuditInsert(
        who.tenantId,
        engagementId,
        who.email,
        "CUSTOM_TASK_CREATED",
        "task",
        publicId,
        { direction, title },
      );
      if (procedureInsert)
        await db.batch([taskInsert, procedureInsert, taskAudit]);
      else await db.batch([taskInsert, taskAudit]);
    } else if (action === "saveTask") {
      const id = Number(body.taskId);
      const task = (
        await db.select().from(s.tasks).where(and(eq(s.tasks.id, id), eq(s.tasks.tenantId, who.tenantId))).limit(1)
      )[0];
      if (!task)
        return Response.json({ error: "Workpaper not found" }, { status: 404 });
      if (Number(body.rowVersion) !== task.rowVersion)
        return Response.json(
          { error: "This workpaper changed after it was loaded. Refresh and review the latest version." },
          { status: 409 },
        );
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
        .where(and(eq(s.procedures.taskId, id), eq(s.procedures.tenantId, who.tenantId)));
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
      const taskUpdate = db.update(s.tasks).set({
          conclusion,
          status,
          preparedBy: status === "PREPARED" ? who.name : task.preparedBy,
          preparedAt: status === "PREPARED" ? now : task.preparedAt,
          reviewedBy: status === "REVIEWED" ? who.name : task.reviewedBy,
          reviewedAt: status === "REVIEWED" ? now : task.reviewedAt,
          updatedAt: now,
          rowVersion: sql`${s.tasks.rowVersion} + 1`,
        }).where(and(eq(s.tasks.id, id), eq(s.tasks.tenantId, who.tenantId)));
      const [{ v }] = await db
        .select({ v: max(s.workpaperVersions.version) })
        .from(s.workpaperVersions)
        .where(
          and(
            eq(s.workpaperVersions.taskId, id),
            eq(s.workpaperVersions.tenantId, who.tenantId),
          ),
        );
      const hash = await snapshotHash({ conclusion, status });
      const versionInsert = db.insert(s.workpaperVersions).values({
        tenantId: who.tenantId,
        taskId: id,
        version: (v ?? 0) + 1,
        conclusion,
        status,
        contentHash: hash,
        actorEmail: who.email,
      });
      const signoffInsert = db.insert(s.signoffs).values({
        tenantId: who.tenantId,
        engagementId: task.engagementId,
        taskId: id,
        type: status,
        statement: `Workpaper Direction ${task.direction} ${status.toLowerCase()}`,
        snapshotHash: hash,
        signedBy: who.email,
      });
      const { statement: auditInsert } = await prepareAuditInsert(
        who.tenantId,
        task.engagementId,
        who.email,
        "WORKPAPER_SAVED",
        "task",
        String(id),
        { status, hash },
      );
      await db.batch([taskUpdate, versionInsert, signoffInsert, auditInsert]);
    } else if (action === "saveProcedure") {
      const id = Number(body.procedureId);
      const procedure = (
        await db
          .select()
          .from(s.procedures)
          .where(and(eq(s.procedures.id, id), eq(s.procedures.tenantId, who.tenantId)))
          .limit(1)
      )[0];
      if (!procedure)
        return Response.json({ error: "Procedure not found" }, { status: 404 });
      if (Number(body.rowVersion) !== procedure.rowVersion)
        return Response.json(
          { error: "This procedure changed after it was loaded. Refresh and review the latest version." },
          { status: 409 },
        );
      const task = (
        await db
          .select()
          .from(s.tasks)
          .where(and(eq(s.tasks.id, procedure.taskId), eq(s.tasks.tenantId, who.tenantId)))
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
      const statements = [];
      statements.push(db
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
          rowVersion: sql`${s.procedures.rowVersion} + 1`,
        })
        .where(and(eq(s.procedures.id, id), eq(s.procedures.tenantId, who.tenantId))));
      if (applicability === "ESCALATED" || concernIdentified) {
        const existingConcern = (
          await db
            .select()
            .from(s.concerns)
            .where(and(eq(s.concerns.procedureId, id), eq(s.concerns.tenantId, who.tenantId)))
            .limit(1)
        )[0];
        if (!existingConcern) {
          const concernPublicId = crypto.randomUUID();
          const concernReference = await nextConcernReference(
            task.engagementId,
            who,
          );
          statements.push(db.insert(s.concerns).values({
            tenantId: who.tenantId,
            publicId: concernPublicId,
            engagementId: task.engagementId,
            taskId: task.id,
            procedureId: id,
            reference: concernReference,
            sourceType: "PROCEDURE",
            title: `Concern from procedure ${task.direction}.${procedure.sequence}`,
            description: concernSummary,
            severity: "MEDIUM",
            targetedResponse:
              "Perform additional targeted verification proportionate to the matter identified.",
            owner: who.name,
            createdBy: who.email,
          }));
          statements.push(db.insert(s.concernEvents).values({
            tenantId: who.tenantId,
            concernId: sql<number>`(SELECT id FROM ${s.concerns} WHERE ${s.concerns.tenantId} = ${who.tenantId} AND ${s.concerns.publicId} = ${concernPublicId})`,
            engagementId: task.engagementId,
            eventType: "CREATED",
            body: concernSummary,
            metadata: JSON.stringify({
              source: `Procedure ${task.direction}.${procedure.sequence}`,
            }),
            actorEmail: who.email,
            actorName: who.name,
          }));
        }
      }
      if (status === "PREPARED" || status === "REVIEWED")
        statements.push(db.insert(s.signoffs).values({
          tenantId: who.tenantId,
          engagementId: task.engagementId,
          taskId: task.id,
          procedureId: id,
          type: `PROCEDURE_${status}`,
          statement: `Procedure ${task.direction}.${procedure.sequence} ${status.toLowerCase()} (${applicability.toLowerCase().replace("_", " ")})`,
          snapshotHash: hash,
          signedBy: who.email,
        }));
      if (task.status === "NOT_STARTED")
        statements.push(db
          .update(s.tasks)
          .set({ status: "IN_PROGRESS", updatedAt: now })
          .where(and(eq(s.tasks.id, task.id), eq(s.tasks.tenantId, who.tenantId))));
      const { statement: procedureAudit } = await prepareAuditInsert(
        who.tenantId,
        task.engagementId,
        who.email,
        "PROCEDURE_SAVED",
        "procedure",
        String(id),
        { status, applicability, hash },
      );
      statements.push(procedureAudit);
      await db.batch(statements as [typeof statements[number], ...typeof statements[number][]]);
    }
  return true;
}
