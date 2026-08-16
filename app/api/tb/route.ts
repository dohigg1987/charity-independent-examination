import { env } from "cloudflare:workers";
import { and, desc, eq, max, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import {
  actor,
  getState,
  prepareAuditInsert,
  snapshotHash,
} from "@/lib/server-data";
import {
  canPrepare,
  canReview,
  requirePermission,
  type Principal,
} from "@/lib/authz";
import {
  enforceRateLimit,
  enforceSameOrigin,
  requireContentType,
  safeDownloadName,
  verifyFile,
} from "@/lib/security";
import { errorResponse, json } from "@/lib/http";
import { validatePayload } from "@/lib/validation";
import { resolvePublicBodyIds, resolvePublicId } from "@/lib/public-ids";

export const dynamic = "force-dynamic";
const template =
  "Account code,Account name,Fund,Debit,Credit,Current balance,Prior balance,Budget balance,Note reference\n1000,Bank current account,Unrestricted,25000,0,25000,18000,22000,\n4000,Donations and legacies,Unrestricted,0,120000,-120000,-105000,-115000,1\n5000,Charitable activities,Restricted,85000,0,85000,72000,90000,2\n";

function bucket() {
  const value = (env as unknown as { BUCKET?: R2Bucket }).BUCKET;
  if (!value) throw new Error("Document storage is unavailable");
  return value;
}
async function nextConcernReference(engagementId: number, tenantId: string) {
  const db = getDb();
  const engagement = (
    await db
      .select({ publicId: s.engagements.publicId })
      .from(s.engagements)
      .where(
        and(
          eq(s.engagements.id, engagementId),
          eq(s.engagements.tenantId, tenantId),
        ),
      )
      .limit(1)
  )[0];
  if (!engagement) throw new Error("Engagement not found");
  return `FND-${engagement.publicId.slice(0, 8).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
}
function normalise(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function number(value: string | undefined) {
  if (!value) return 0;
  const negative = /^\s*\(.*\)\s*$/.test(value),
    cleaned = value.replace(/[£,$()\s]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? (negative ? -Math.abs(parsed) : parsed) : 0;
}
function close(a: number, b: number) {
  return Math.abs(a - b) < 0.01;
}

function parseCsv(text: string) {
  const sample = text.split(/\r?\n/, 1)[0] || "";
  const delimiter =
    (sample.match(/\t/g)?.length || 0) > (sample.match(/,/g)?.length || 0)
      ? "\t"
      : (sample.match(/;/g)?.length || 0) > (sample.match(/,/g)?.length || 0)
        ? ";"
        : ",";
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function headerIndex(headers: string[], aliases: string[]) {
  const values = headers.map(normalise);
  return values.findIndex((value) => aliases.includes(value));
}
function autoMap(name: string, fund: string) {
  const v = name.toLowerCase();
  if (/bank|cash/.test(v)) return "Cash at bank and in hand";
  if (/debtor|receivable|prepayment/.test(v)) return "Debtors";
  if (/creditor|payable|accrual/.test(v))
    return "Creditors due within one year";
  if (/fixed asset|equipment|vehicle|property|building/.test(v))
    return "Fixed assets";
  if (/investment/.test(v) && !/income|interest|dividend/.test(v))
    return "Investments";
  if (/donation|legacy|gift aid/.test(v)) return "Donations and legacies";
  if (/grant|charitable income|contract income/.test(v))
    return "Charitable activities income";
  if (/trading|shop|fundraising income/.test(v))
    return "Other trading activities";
  if (/interest|dividend|investment income/.test(v)) return "Investment income";
  if (/fundrais|raising funds/.test(v)) return "Raising funds";
  if (/charitable|grant paid|project cost|beneficiar/.test(v))
    return "Charitable activities expenditure";
  if (/restricted/.test(fund.toLowerCase())) return "Restricted funds";
  if (/endowment/.test(fund.toLowerCase())) return "Endowment funds";
  if (/reserve|accumulated fund|unrestricted fund/.test(v))
    return "Unrestricted funds";
  return "UNMAPPED";
}

async function requireOpen(engagementId: number) {
  const who = await actor();
  const row = (
    await getDb()
      .select()
      .from(s.engagements)
      .where(and(eq(s.engagements.id, engagementId), eq(s.engagements.tenantId, who.tenantId)))
      .limit(1)
  )[0];
  if (!row) throw new Error("Engagement not found");
  if (row.lockedAt)
    throw new Error(
      "This annual file is locked. Reopen it before changing TB analysis.",
    );
  return row;
}
async function importFor(id: number) {
  const who = await actor();
  const row = (
    await getDb()
      .select()
      .from(s.tbImports)
      .where(and(eq(s.tbImports.id, id), eq(s.tbImports.tenantId, who.tenantId)))
      .limit(1)
  )[0];
  if (!row) throw new Error("Trial balance version not found");
  await requireOpen(row.engagementId);
  return row;
}

export async function GET(request: Request) {
  try {
    const who = await actor();
    requirePermission(
      canPrepare(who),
      "Engagement team permission is required",
    );
    const params = new URL(request.url).searchParams;
    if (params.get("template") !== "1")
      return json({ error: "Unknown request" }, { status: 400 });
    return new Response(template, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          "attachment; filename=clarity-ie-trial-balance-template.csv",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error, "Unable to download template");
  }
}

export async function POST(request: Request) {
  try {
    enforceSameOrigin(request);
    const who = await actor();
    requirePermission(
      canPrepare(who),
      "Engagement team permission is required",
    );
    await enforceRateLimit(who.tenantId, `tb:${who.email}`, 60, 60_000);
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      requireContentType(request, "multipart");
      return await importTrialBalance(request);
    }
    requireContentType(request, "json");
    const db = getDb(),
      input = (await request.json()) as Record<string, unknown>,
      action = String(input.action || "");
    validatePayload(input);
    const body = await resolvePublicBodyIds(who.tenantId, input);
    if (action === "updateTbAccount") {
      const id = Number(body.accountId),
        account = (
          await db
            .select()
            .from(s.tbAccounts)
            .where(and(eq(s.tbAccounts.id, id), eq(s.tbAccounts.tenantId, who.tenantId)))
            .limit(1)
        )[0];
      if (!account)
        return Response.json(
          { error: "TB account not found" },
          { status: 404 },
        );
      const imported = await importFor(account.tbImportId),
        statementLine = String(body.statementLine || account.statementLine),
        fund = String(body.fund || account.fund),
        noteReference = String(body.noteReference ?? account.noteReference);
      const accountUpdate = db
        .update(s.tbAccounts)
        .set({
          statementLine,
          fund,
          noteReference,
          mappingStatus: statementLine === "UNMAPPED" ? "UNMAPPED" : "MANUAL",
        })
        .where(
          and(
            eq(s.tbAccounts.id, id),
            eq(s.tbAccounts.tenantId, who.tenantId),
          ),
        );
      const reconciliationStatements = await prepareReconciliationStatements(
          imported.engagementId,
          imported.id,
          who.tenantId,
          { accountId: id, statementLine },
        ),
        auditInsert = (
          await prepareAuditInsert(
            who.tenantId,
            imported.engagementId,
            who.email,
            "TB_ACCOUNT_MAPPED",
            "tb_account",
            String(id),
            { statementLine, fund, noteReference },
          )
        ).statement,
        statements = [accountUpdate, ...reconciliationStatements, auditInsert];
      await db.batch(
        statements as [
          (typeof statements)[number],
          ...(typeof statements)[number][],
        ],
      );
    } else if (action === "updateTbReconciliation") {
      const id = Number(body.reconciliationId),
        row = (
          await db
            .select()
            .from(s.tbReconciliations)
            .where(and(eq(s.tbReconciliations.id, id), eq(s.tbReconciliations.tenantId, who.tenantId)))
            .limit(1)
        )[0];
      if (!row)
        return Response.json(
          { error: "Reconciliation not found" },
          { status: 404 },
        );
      await importFor(row.tbImportId);
      const accountsAmount = Number(body.accountsAmount || 0),
        difference = row.tbAmount - accountsAmount,
        explanation = String(body.explanation || "").trim(),
        status = close(difference, 0)
          ? "RECONCILED"
          : explanation
            ? "EXPLAINED"
            : "NOT_RECONCILED";
      const reconciliationUpdate = db
        .update(s.tbReconciliations)
        .set({
          accountsAmount,
          difference,
          explanation,
          status,
          preparedBy: who.name,
          preparedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(s.tbReconciliations.id, id),
            eq(s.tbReconciliations.tenantId, who.tenantId),
          ),
        ),
        auditInsert = (
          await prepareAuditInsert(
            who.tenantId,
            row.engagementId,
            who.email,
            "TB_RECONCILIATION_UPDATED",
            "tb_reconciliation",
            String(id),
            { status, difference },
          )
        ).statement;
      await db.batch([reconciliationUpdate, auditInsert]);
    } else if (action === "saveAnalytic") {
      const id = Number(body.analyticId),
        row = (
          await db
            .select()
            .from(s.tbAnalytics)
            .where(and(eq(s.tbAnalytics.id, id), eq(s.tbAnalytics.tenantId, who.tenantId)))
            .limit(1)
        )[0];
      if (!row)
        return Response.json(
          { error: "Analytical exception not found" },
          { status: 404 },
        );
      await importFor(row.tbImportId);
      const explanation = String(body.explanation || "").trim(),
        targetedWork = String(body.targetedWork || "").trim(),
        conclusion = String(body.conclusion || "").trim(),
        status = String(body.status || "OPEN"),
        now = new Date().toISOString();
      if (!["PREPARED", "REVIEWED"].includes(status))
        return Response.json(
          { error: "Select a valid analytical sign-off status" },
          { status: 400 },
        );
      if (
        (status === "PREPARED" || status === "REVIEWED") &&
        (!explanation || !targetedWork || !conclusion)
      )
        return Response.json(
          {
            error:
              "Explanation, targeted work and conclusion are required before analytical sign-off",
          },
          { status: 400 },
        );
      if (status === "REVIEWED" && !row.preparedBy)
        return Response.json(
          { error: "Prepare the analytical exception before review" },
          { status: 400 },
        );
      if (status === "REVIEWED")
        await requireDifferentSigner(
          who,
          row.engagementId,
          "TB_ANALYTIC_PREPARED",
          row.linkedTaskId,
          row.linkedProcedureId,
        );
      const hash = await snapshotHash({
        ...row,
        explanation,
        targetedWork,
        conclusion,
        status,
      });
      const analyticUpdate = db
        .update(s.tbAnalytics)
        .set({
          explanation,
          targetedWork,
          conclusion,
          status,
          preparedBy: status === "PREPARED" ? who.email : row.preparedBy,
          preparedAt: status === "PREPARED" ? now : row.preparedAt,
          reviewedBy: status === "REVIEWED" ? who.email : row.reviewedBy,
          reviewedAt: status === "REVIEWED" ? now : row.reviewedAt,
        })
        .where(and(eq(s.tbAnalytics.id, id), eq(s.tbAnalytics.tenantId, who.tenantId)));
      const { statement: auditInsert } = await prepareAuditInsert(
        who.tenantId,
        row.engagementId,
        who.email,
        "TB_ANALYTIC_SAVED",
        "tb_analytic",
        String(id),
        { status, hash },
      );
      if (status === "PREPARED" || status === "REVIEWED") {
        const signoffInsert = db.insert(s.signoffs).values({
          tenantId: who.tenantId,
          engagementId: row.engagementId,
          taskId: row.linkedTaskId,
          procedureId: row.linkedProcedureId,
          type: `TB_ANALYTIC_${status}`,
          statement: `Analytical exception ${row.title} ${status.toLowerCase()}`,
          snapshotHash: hash,
          signedBy: who.email,
        });
        await db.batch([analyticUpdate, signoffInsert, auditInsert]);
      } else await db.batch([analyticUpdate, auditInsert]);
    } else if (action === "escalateAnalytic") {
      const id = Number(body.analyticId),
        row = (
          await db
            .select()
            .from(s.tbAnalytics)
            .where(and(eq(s.tbAnalytics.id, id), eq(s.tbAnalytics.tenantId, who.tenantId)))
            .limit(1)
        )[0];
      if (!row)
        return Response.json(
          { error: "Analytical exception not found" },
          { status: 404 },
        );
      await importFor(row.tbImportId);
      if (!row.concernId) {
        const concernPublicId = crypto.randomUUID(),
          reference = await nextConcernReference(
            row.engagementId,
            who.tenantId,
          ),
          description = `${row.expectation}. Actual ${row.actual}; comparator ${row.comparator}; variance ${row.variance}.`,
          concernId = sql<number>`(
            SELECT ${s.concerns.id}
            FROM ${s.concerns}
            WHERE ${s.concerns.tenantId} = ${who.tenantId}
              AND ${s.concerns.publicId} = ${concernPublicId}
          )`,
          concernInsert = db.insert(s.concerns).values({
            tenantId: who.tenantId,
            publicId: concernPublicId,
            engagementId: row.engagementId,
            taskId: row.linkedTaskId,
            procedureId: row.linkedProcedureId,
            reference,
            sourceType: "TB_ANALYTIC",
            title: `TB analytical exception: ${row.title}`,
            description,
            severity: row.severity,
            targetedResponse:
              row.targetedWork ||
              "Obtain an explanation and perform proportionate targeted verification.",
            owner: who.name,
            createdBy: who.email,
          }),
          eventInsert = db.insert(s.concernEvents).values({
            tenantId: who.tenantId,
            concernId,
            engagementId: row.engagementId,
            eventType: "CREATED",
            body: description,
            metadata: JSON.stringify({ analyticId: row.id }),
            actorEmail: who.email,
            actorName: who.name,
          }),
          analyticUpdate = db
            .update(s.tbAnalytics)
            .set({ concernId, status: "ESCALATED" })
            .where(
              and(
                eq(s.tbAnalytics.id, id),
                eq(s.tbAnalytics.tenantId, who.tenantId),
              ),
            ),
          auditInsert = (
            await prepareAuditInsert(
              who.tenantId,
              row.engagementId,
              who.email,
              "TB_ANALYTIC_ESCALATED",
              "tb_analytic",
              String(id),
              { concernPublicId, reference },
            )
          ).statement;
        await db.batch([
          concernInsert,
          eventInsert,
          analyticUpdate,
          auditInsert,
        ]);
      }
    } else if (action === "requestAnalyticEvidence") {
      const id = Number(body.analyticId),
        row = (
          await db
            .select()
            .from(s.tbAnalytics)
            .where(and(eq(s.tbAnalytics.id, id), eq(s.tbAnalytics.tenantId, who.tenantId)))
            .limit(1)
        )[0];
      if (!row)
        return Response.json(
          { error: "Analytical exception not found" },
          { status: 404 },
        );
      const imported = await importFor(row.tbImportId),
        engagement = (
          await db
            .select()
            .from(s.engagements)
            .where(and(eq(s.engagements.id, imported.engagementId), eq(s.engagements.tenantId, who.tenantId)))
            .limit(1)
        )[0],
        client = (
          await db
            .select()
            .from(s.clients)
            .where(and(eq(s.clients.id, engagement.clientId), eq(s.clients.tenantId, who.tenantId)))
            .limit(1)
        )[0],
        reference = `REQ-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        requestInsert = db.insert(s.evidenceRequests).values({
          tenantId: who.tenantId,
          engagementId: row.engagementId,
          taskId: row.linkedTaskId,
          procedureId: row.linkedProcedureId,
          reference,
          title: `TB analysis: ${row.title}`,
          description: `Please explain the identified variance and provide supporting evidence. ${row.expectation}`,
          contactName: client.contactName,
          contactEmail: client.contactEmail,
          dueDate: String(
            body.dueDate ||
              new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
          ),
        }),
        auditInsert = (
          await prepareAuditInsert(
            who.tenantId,
            row.engagementId,
            who.email,
            "TB_ANALYTIC_REQUEST_SENT",
            "tb_analytic",
            String(id),
            { reference },
          )
        ).statement;
      await db.batch([requestInsert, auditInsert]);
    } else if (action === "signoffTb") {
      const id = Number(body.tbImportId),
        row = await importFor(id),
        accounts = await db
          .select()
          .from(s.tbAccounts)
          .where(and(eq(s.tbAccounts.tbImportId, id), eq(s.tbAccounts.tenantId, who.tenantId))),
        analytics = await db
          .select()
          .from(s.tbAnalytics)
          .where(and(eq(s.tbAnalytics.tbImportId, id), eq(s.tbAnalytics.tenantId, who.tenantId))),
        reconciliations = await db
          .select()
          .from(s.tbReconciliations)
          .where(and(eq(s.tbReconciliations.tbImportId, id), eq(s.tbReconciliations.tenantId, who.tenantId))),
        status = String(body.status || "PREPARED"),
        conclusion = String(body.conclusion || "").trim(),
        now = new Date().toISOString();
      if (!["PREPARED", "REVIEWED"].includes(status))
        return Response.json(
          { error: "Select a valid trial balance sign-off status" },
          { status: 400 },
        );
      if (!conclusion)
        return Response.json(
          { error: "Record the overall analytical review conclusion" },
          { status: 400 },
        );
      if (
        safeJsonArray(row.validationIssues).length ||
        !row.isBalanced ||
        accounts.some((a) => a.statementLine === "UNMAPPED") ||
        analytics.some((a) => a.status !== "REVIEWED") ||
        reconciliations.some((r) => r.status === "NOT_RECONCILED")
      )
        return Response.json(
          {
            error:
              "Clear validation, balance the TB, map every account, review analytical exceptions and clear statement reconciliations before sign-off",
          },
          { status: 409 },
        );
      if (status === "REVIEWED" && !row.preparedBy)
        return Response.json(
          { error: "Prepare the TB analysis before review" },
          { status: 400 },
        );
      if (status === "REVIEWED")
        await requireDifferentSigner(
          who,
          row.engagementId,
          "TB_ANALYSIS_PREPARED",
          null,
          null,
        );
      const hash = await snapshotHash({
        row,
        accounts,
        analytics,
        reconciliations,
        conclusion,
        status,
      });
      const importUpdate = db
        .update(s.tbImports)
        .set({
          analysisConclusion: conclusion,
          status,
          preparedBy: status === "PREPARED" ? who.email : row.preparedBy,
          preparedAt: status === "PREPARED" ? now : row.preparedAt,
          reviewedBy: status === "REVIEWED" ? who.email : row.reviewedBy,
          reviewedAt: status === "REVIEWED" ? now : row.reviewedAt,
        })
        .where(and(eq(s.tbImports.id, id), eq(s.tbImports.tenantId, who.tenantId))),
        signoffInsert = db.insert(s.signoffs).values({
          tenantId: who.tenantId,
          engagementId: row.engagementId,
          type: `TB_ANALYSIS_${status}`,
          statement: `Trial balance version ${row.version} analysis ${status.toLowerCase()}`,
          snapshotHash: hash,
          signedBy: who.email,
        }),
        auditInsert = (
          await prepareAuditInsert(
            who.tenantId,
            row.engagementId,
            who.email,
            "TB_ANALYSIS_SIGNED_OFF",
            "tb_import",
            String(id),
            { status, hash },
          )
        ).statement;
      await db.batch([importUpdate, signoffInsert, auditInsert]);
    } else
      return Response.json({ error: "Unknown TB action" }, { status: 400 });
    return json(await getState(who));
  } catch (error) {
    return errorResponse(error, "Unable to process trial balance");
  }
}

async function importTrialBalance(request: Request) {
  const db = getDb(),
    who = await actor(),
    form = await request.formData(),
    file = form.get("file"),
    engagementId = await resolvePublicId(who.tenantId, "engagement", form.get("engagementId"), "engagementId");
  if (!(file instanceof File) || !engagementId)
    return Response.json(
      { error: "A CSV trial balance and engagement are required" },
      { status: 400 },
    );
  const engagement = await requireOpen(engagementId);
  if (file.size > 25 * 1024 * 1024)
    return Response.json(
      { error: "File exceeds the 25 MB limit" },
      { status: 400 },
    );
  const bytes = await file.arrayBuffer();
  verifyFile(file, bytes);
  const text = new TextDecoder().decode(bytes),
    rows = parseCsv(text);
  if (rows.length < 2)
    return Response.json(
      { error: "The TB file contains no account rows" },
      { status: 400 },
    );
  const headers = rows[0],
    indexes = {
      code: headerIndex(headers, [
        "accountcode",
        "code",
        "nominalcode",
        "nominal",
      ]),
      name: headerIndex(headers, [
        "accountname",
        "name",
        "nominalname",
        "description",
      ]),
      fund: headerIndex(headers, ["fund", "fundname"]),
      debit: headerIndex(headers, ["debit", "debits"]),
      credit: headerIndex(headers, ["credit", "credits"]),
      current: headerIndex(headers, [
        "currentbalance",
        "current",
        "currentyear",
        "balance",
      ]),
      prior: headerIndex(headers, [
        "priorbalance",
        "prior",
        "prioryear",
        "previousyear",
      ]),
      budget: headerIndex(headers, ["budgetbalance", "budget"]),
      note: headerIndex(headers, ["notereference", "note", "accountsnote"]),
    };
  if (
    indexes.code < 0 ||
    indexes.name < 0 ||
    (indexes.current < 0 && (indexes.debit < 0 || indexes.credit < 0))
  )
    return Response.json(
      {
        error:
          "Required columns: Account code, Account name, and either Current balance or Debit and Credit",
      },
      { status: 400 },
    );
  const issues: string[] = [],
    seen = new Set<string>(),
    parsed = rows.slice(1).map((cells, rowIndex) => {
      const accountCode = cells[indexes.code]?.trim(),
        accountName = cells[indexes.name]?.trim(),
        fund =
          indexes.fund >= 0
            ? cells[indexes.fund]?.trim() || "Unrestricted"
            : "Unrestricted",
        debit = indexes.debit >= 0 ? number(cells[indexes.debit]) : 0,
        credit = indexes.credit >= 0 ? number(cells[indexes.credit]) : 0,
        currentBalance =
          indexes.current >= 0
            ? number(cells[indexes.current])
            : debit - credit,
        priorBalance = indexes.prior >= 0 ? number(cells[indexes.prior]) : 0,
        budgetBalance = indexes.budget >= 0 ? number(cells[indexes.budget]) : 0,
        noteReference =
          indexes.note >= 0 ? cells[indexes.note]?.trim() || "" : "",
        key = `${accountCode}|${fund}`;
      if (!accountCode || !accountName)
        issues.push(`Row ${rowIndex + 2}: account code and name are required`);
      if (seen.has(key))
        issues.push(
          `Row ${rowIndex + 2}: duplicate account and fund combination ${key}`,
        );
      seen.add(key);
      const statementLine = autoMap(accountName, fund);
      return {
        accountCode: accountCode || `ROW-${rowIndex + 2}`,
        accountName: accountName || "Unnamed account",
        fund,
        statementLine,
        noteReference,
        debit,
        credit,
        currentBalance,
        priorBalance,
        budgetBalance,
        mappingStatus: statementLine === "UNMAPPED" ? "UNMAPPED" : "AUTO",
      };
    });
  let debitTotal = parsed.reduce((n, r) => n + r.debit, 0),
    creditTotal = parsed.reduce((n, r) => n + r.credit, 0);
  const netTotal = parsed.reduce((n, r) => n + r.currentBalance, 0);
  if (indexes.debit < 0) {
    debitTotal = parsed.reduce((n, r) => n + Math.max(r.currentBalance, 0), 0);
    creditTotal = parsed.reduce(
      (n, r) => n + Math.abs(Math.min(r.currentBalance, 0)),
      0,
    );
  }
  const isBalanced = close(netTotal, 0) || close(debitTotal, creditTotal);
  if (!isBalanced)
    issues.push(
      `Trial balance does not balance: net difference ${netTotal.toFixed(2)}`,
    );
  const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    )
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(""),
    key = `tenants/${who.tenantId}/engagements/${engagement.publicId}/trial_balance/${crypto.randomUUID()}-${safeDownloadName(file.name)}`,
    documentPublicId = crypto.randomUUID(),
    importPublicId = crypto.randomUUID(),
    [{ v }] = await db
      .select({ v: max(s.tbImports.version) })
      .from(s.tbImports)
      .where(
        and(
          eq(s.tbImports.engagementId, engagementId),
          eq(s.tbImports.tenantId, who.tenantId),
        ),
      ),
    version = (v ?? 0) + 1;
  await bucket().put(key, bytes, {
    httpMetadata: { contentType: "text/csv" },
    customMetadata: {
      tenantId: who.tenantId,
      engagementPublicId: engagement.publicId,
      fileSection: "TRIAL_BALANCE",
      uploadedBy: who.email,
      sha256: digest,
      validation: "signature-verified",
    },
  });
  try {
    const documentInsert = db.insert(s.documents).values({
        tenantId: who.tenantId,
        publicId: documentPublicId,
        engagementId,
        fileSection: "TRIAL_BALANCE",
        fileName: file.name,
        mimeType: "text/csv",
        byteSize: file.size,
        storageKey: key,
        sha256: digest,
        uploadedBy: who.email,
        malwareStatus: "SIGNATURE_VERIFIED",
      }),
      documentId = sql<number>`(
        SELECT ${s.documents.id}
        FROM ${s.documents}
        WHERE ${s.documents.tenantId} = ${who.tenantId}
          AND ${s.documents.publicId} = ${documentPublicId}
      )`,
      tbImportId = sql<number>`(
        SELECT ${s.tbImports.id}
        FROM ${s.tbImports}
        WHERE ${s.tbImports.tenantId} = ${who.tenantId}
          AND ${s.tbImports.publicId} = ${importPublicId}
      )`,
      importInsert = db.insert(s.tbImports).values({
        tenantId: who.tenantId,
        publicId: importPublicId,
        engagementId,
        documentId,
        version,
        fileName: file.name,
        sourceFormat: "CSV",
        status: "PROCESSING",
        rowCount: parsed.length,
        debitTotal,
        creditTotal,
        netTotal,
        isBalanced,
        validationIssues: JSON.stringify(issues),
        uploadedBy: who.email,
      }),
      accountInsert = db.insert(s.tbAccounts).values(
        parsed.map((row) => ({
          ...row,
          tenantId: who.tenantId,
          tbImportId,
        })),
      );
    await db.batch([documentInsert, importInsert, accountInsert]);

    const imported = (
      await db
        .select()
        .from(s.tbImports)
        .where(
          and(
            eq(s.tbImports.publicId, importPublicId),
            eq(s.tbImports.tenantId, who.tenantId),
          ),
        )
        .limit(1)
    )[0];
    if (!imported) throw new Error("Trial balance import could not be staged");

    const analytics = await buildAnalytics(engagement, imported.id),
      reconciliations = buildInitialReconciliations(
        parsed,
        engagementId,
        imported.id,
        who.tenantId,
      ),
      finalStatus = issues.length ? "VALIDATION_REQUIRED" : "IMPORTED",
      finaliseImport = db
        .update(s.tbImports)
        .set({ status: finalStatus })
        .where(
          and(
            eq(s.tbImports.id, imported.id),
            eq(s.tbImports.tenantId, who.tenantId),
          ),
        ),
      auditInsert = (
        await prepareAuditInsert(
          who.tenantId,
          engagementId,
          who.email,
          "TRIAL_BALANCE_IMPORTED",
          "tb_import",
          imported.publicId,
          {
            version: imported.version,
            rowCount: parsed.length,
            isBalanced,
            issues: issues.length,
            sha256: digest,
          },
        )
      ).statement;
    if (analytics.length && reconciliations.length)
      await db.batch([
        db.insert(s.tbAnalytics).values(analytics),
        db.insert(s.tbReconciliations).values(reconciliations),
        finaliseImport,
        auditInsert,
      ]);
    else if (analytics.length)
      await db.batch([
        db.insert(s.tbAnalytics).values(analytics),
        finaliseImport,
        auditInsert,
      ]);
    else if (reconciliations.length)
      await db.batch([
        db.insert(s.tbReconciliations).values(reconciliations),
        finaliseImport,
        auditInsert,
      ]);
    else await db.batch([finaliseImport, auditInsert]);
    return json(await getState(who), { status: 201 });
  } catch (error) {
    try {
      const failedImportId = sql<number>`(
        SELECT ${s.tbImports.id}
        FROM ${s.tbImports}
        WHERE ${s.tbImports.tenantId} = ${who.tenantId}
          AND ${s.tbImports.publicId} = ${importPublicId}
      )`;
      await db.batch([
        db
          .delete(s.tbAnalytics)
          .where(
            and(
              eq(s.tbAnalytics.tenantId, who.tenantId),
              eq(s.tbAnalytics.tbImportId, failedImportId),
            ),
          ),
        db
          .delete(s.tbReconciliations)
          .where(
            and(
              eq(s.tbReconciliations.tenantId, who.tenantId),
              eq(s.tbReconciliations.tbImportId, failedImportId),
            ),
          ),
        db
          .delete(s.tbAccounts)
          .where(
            and(
              eq(s.tbAccounts.tenantId, who.tenantId),
              eq(s.tbAccounts.tbImportId, failedImportId),
            ),
          ),
        db
          .delete(s.tbImports)
          .where(
            and(
              eq(s.tbImports.tenantId, who.tenantId),
              eq(s.tbImports.publicId, importPublicId),
            ),
          ),
        db
          .delete(s.documents)
          .where(
            and(
              eq(s.documents.tenantId, who.tenantId),
              eq(s.documents.publicId, documentPublicId),
            ),
          ),
      ]);
    } catch {
      // Preserve the original import failure. PROCESSING marks any residue unsafe.
    }
    try {
      await (
        bucket() as R2Bucket & { delete(key: string): Promise<void> }
      ).delete(key);
    } catch {
      // Database state is authoritative; orphaned storage can be swept by key.
    }
    throw error;
  }
}

async function requireDifferentSigner(
  principal: Principal,
  engagementId: number,
  type: string,
  taskId: number | null,
  procedureId: number | null,
): Promise<void> {
  const rows = await getDb()
    .select()
    .from(s.signoffs)
    .where(and(eq(s.signoffs.engagementId, engagementId), eq(s.signoffs.tenantId, principal.tenantId)))
    .orderBy(desc(s.signoffs.id));
  const prepared = rows.find(
    (row) =>
      row.type === type &&
      row.taskId === taskId &&
      row.procedureId === procedureId,
  );
  requirePermission(canReview(principal), "Reviewer permission is required");
  requirePermission(
    Boolean(prepared),
    "A recorded preparer sign-off is required before review",
  );
  requirePermission(
    prepared!.signedBy.toLowerCase() !== principal.email.toLowerCase(),
    "The preparer cannot review their own work",
  );
}

async function buildAnalytics(
  engagement: typeof s.engagements.$inferSelect,
  tbImportId: number,
) {
  const db = getDb(),
    accounts = await db
      .select()
      .from(s.tbAccounts)
      .where(and(eq(s.tbAccounts.tbImportId, tbImportId), eq(s.tbAccounts.tenantId, engagement.tenantId))),
    direction11 = (
      await db
        .select()
        .from(s.tasks)
        .where(and(eq(s.tasks.engagementId, engagement.id), eq(s.tasks.tenantId, engagement.tenantId)))
    ).find((t) => t.direction === 11),
    procedure = direction11
      ? (
          await db
            .select()
            .from(s.procedures)
            .where(and(eq(s.procedures.taskId, direction11.id), eq(s.procedures.tenantId, engagement.tenantId)))
        ).find((p) => p.sequence === 1)
      : undefined,
    threshold =
      engagement.materiality > 0
        ? engagement.materiality
        : Math.max(500, engagement.grossIncome * 0.02),
    values: (typeof s.tbAnalytics.$inferInsert)[] = [];
  for (const account of accounts) {
    const variance = account.currentBalance - account.priorBalance,
      variancePercent = account.priorBalance
        ? (variance / Math.abs(account.priorBalance)) * 100
        : account.currentBalance
          ? 100
          : 0,
      budgetVariance = account.currentBalance - account.budgetBalance,
      budgetPercent = account.budgetBalance
        ? (budgetVariance / Math.abs(account.budgetBalance)) * 100
        : account.currentBalance
          ? 100
          : 0,
      base = {
        tenantId: engagement.tenantId,
        engagementId: engagement.id,
        tbImportId,
        accountId: account.id,
        significanceThreshold: threshold,
        linkedTaskId: direction11?.id,
        linkedProcedureId: procedure?.id,
      };
    if (Math.abs(variance) >= threshold && Math.abs(variancePercent) >= 15)
      values.push({
        ...base,
        type: "PRIOR_YEAR_VARIANCE",
        title: `${account.accountCode} ${account.accountName}: prior-year variance`,
        expectation:
          "Movement should be consistent with prior activity and the charity's circumstances",
        actual: account.currentBalance,
        comparator: account.priorBalance,
        variance,
        variancePercent,
        severity: Math.abs(variance) >= threshold * 3 ? "HIGH" : "MEDIUM",
      });
    if (
      account.budgetBalance &&
      Math.abs(budgetVariance) >= threshold &&
      Math.abs(budgetPercent) >= 15
    )
      values.push({
        ...base,
        type: "BUDGET_VARIANCE",
        title: `${account.accountCode} ${account.accountName}: budget variance`,
        expectation:
          "Outturn should be consistent with the approved budget or supported by a documented explanation",
        actual: account.currentBalance,
        comparator: account.budgetBalance,
        variance: budgetVariance,
        variancePercent: budgetPercent,
        severity: Math.abs(budgetVariance) >= threshold * 3 ? "HIGH" : "MEDIUM",
      });
    if (
      /suspense|clearing|unknown|miscellaneous/.test(
        account.accountName.toLowerCase(),
      ) &&
      Math.abs(account.currentBalance) >= threshold
    )
      values.push({
        ...base,
        type: "SUSPENSE_BALANCE",
        title: `${account.accountCode} ${account.accountName}: unusual control balance`,
        expectation:
          "Suspense and clearing balances should be nil or supported by a clear reconciliation",
        actual: account.currentBalance,
        comparator: 0,
        variance: account.currentBalance,
        variancePercent: 100,
        severity: "HIGH",
      });
    if (
      account.statementLine === "UNMAPPED" &&
      Math.abs(account.currentBalance) >= threshold
    )
      values.push({
        ...base,
        type: "UNMAPPED_SIGNIFICANT",
        title: `${account.accountCode} ${account.accountName}: significant unmapped balance`,
        expectation:
          "Significant TB accounts should be mapped to the draft accounts",
        actual: account.currentBalance,
        comparator: 0,
        variance: account.currentBalance,
        variancePercent: 100,
        severity: "MEDIUM",
      });
  }
  return values;
}

function buildInitialReconciliations(
  accounts: Array<{ statementLine: string; currentBalance: number }>,
  engagementId: number,
  tbImportId: number,
  tenantId: string,
) {
  const lines = new Map<string, number>();
  for (const account of accounts)
    if (account.statementLine !== "UNMAPPED")
      lines.set(
        account.statementLine,
        (lines.get(account.statementLine) || 0) + account.currentBalance,
      );
  return [...lines].map(([statementLine, tbAmount]) => ({
    tenantId,
    engagementId,
    tbImportId,
    statementLine,
    tbAmount,
    difference: tbAmount,
  }));
}
function safeJsonArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return ["Invalid validation record"];
  }
}
async function prepareReconciliationStatements(
  engagementId: number,
  tbImportId: number,
  tenantId: string,
  accountOverride?: { accountId: number; statementLine: string },
) {
  const db = getDb(),
    accounts = await db
      .select()
      .from(s.tbAccounts)
      .where(and(eq(s.tbAccounts.tbImportId, tbImportId), eq(s.tbAccounts.tenantId, tenantId))),
    existing = await db
      .select()
      .from(s.tbReconciliations)
      .where(and(eq(s.tbReconciliations.tbImportId, tbImportId), eq(s.tbReconciliations.tenantId, tenantId))),
    lines = new Map<string, number>();
  for (const storedAccount of accounts) {
    const account =
      storedAccount.id === accountOverride?.accountId
        ? { ...storedAccount, statementLine: accountOverride.statementLine }
        : storedAccount;
    if (account.statementLine !== "UNMAPPED")
      lines.set(
        account.statementLine,
        (lines.get(account.statementLine) || 0) + account.currentBalance,
      );
  }
  const statements = [];
  for (const row of existing)
    if (!lines.has(row.statementLine))
      statements.push(
        db
          .delete(s.tbReconciliations)
          .where(
            and(
              eq(s.tbReconciliations.id, row.id),
              eq(s.tbReconciliations.tenantId, tenantId),
            ),
          ),
      );
  for (const [statementLine, tbAmount] of lines) {
    const row = existing.find((x) => x.statementLine === statementLine);
    if (row)
      statements.push(
        db
          .update(s.tbReconciliations)
          .set({
            tbAmount,
            difference: tbAmount - row.accountsAmount,
            status: close(tbAmount, row.accountsAmount)
              ? "RECONCILED"
              : row.explanation
                ? "EXPLAINED"
                : "NOT_RECONCILED",
          })
          .where(
            and(
              eq(s.tbReconciliations.id, row.id),
              eq(s.tbReconciliations.tenantId, tenantId),
            ),
          ),
      );
    else
      statements.push(
        db.insert(s.tbReconciliations).values({
          tenantId,
          engagementId,
          tbImportId,
          statementLine,
          tbAmount,
          difference: tbAmount,
        }),
      );
  }
  return statements;
}
