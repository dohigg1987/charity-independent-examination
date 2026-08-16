import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import {
  applicableRuleSet,
  audit,
  engagementEligibility,
  prepareAuditInsert,
} from "@/lib/server-data";
import { planRulePublication } from "@/lib/rule-series";
import {
  normaliseRole,
  requirePermission,
  type Principal,
} from "@/lib/authz";
import {
  requireEmail,
  requireIsoDate,
  requireNonNegativeNumber,
  requireOneOf,
} from "@/lib/validation";
import { requireOpenEngagement as requireOpen } from "@/lib/state-actions/engagements";

export type StateActionResult = Response | true | false;

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

const actions = new Set([
  "addTeamMember",
  "updateTeamMember",
  "updateJurisdiction",
  "createJurisdictionRuleSet",
  "updateJurisdictionRuleSet",
  "saveAndPublishJurisdictionRuleSet",
  "publishJurisdictionRuleSet",
  "createOrganisationType",
  "updateOrganisationType",
  "addTrustee",
  "updateTrustee",
  "addClientUser",
  "updateClientUser",
  "updateScope",
  "updateQualityReview",
  "updatePracticeSettings",
]);

export async function handlePracticeAdminAction(
  action: string,
  body: Record<string, unknown>,
  who: Principal,
): Promise<StateActionResult> {
  if (!actions.has(action)) return false;
  const db = getDb();
    if (action === "addTeamMember") {
      const email = requireEmail(String(body.email || ""));
      const name = String(body.name || "").trim();
      if (!email || !name)
        return Response.json(
          { error: "Name and email are required" },
          { status: 400 },
        );
      const role = requireInternalRole(String(body.role || "PREPARER"));
      const existing = (
        await db
          .select({ publicId: s.users.publicId })
          .from(s.users)
          .where(and(eq(s.users.tenantId, who.tenantId), eq(s.users.email, email)))
          .limit(1)
      )[0];
      const publicId = existing?.publicId ?? crypto.randomUUID();
      const memberUpsert = db
        .insert(s.users)
        .values({
          tenantId: who.tenantId,
          publicId,
          email,
          name,
          role,
        })
        .onConflictDoUpdate({
          target: [s.users.tenantId, s.users.email],
          set: {
            name,
            role,
          },
        });
      const { statement: memberAudit } = await prepareAuditInsert(
        who.tenantId,
        null,
        who.email,
        "TEAM_MEMBER_SAVED",
        "user",
        publicId,
        { email, role },
      );
      await db.batch([memberUpsert, memberAudit]);
    } else if (action === "updateTeamMember") {
      const id = Number(body.userId);
      const row = (
        await db.select().from(s.users).where(and(eq(s.users.id, id), eq(s.users.tenantId, who.tenantId))).limit(1)
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
        const remainingAdministrators = (
          await db
            .select()
            .from(s.users)
            .where(eq(s.users.tenantId, who.tenantId))
        ).filter(
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
      const memberUpdate = db
        .update(s.users)
        .set({ status, role })
        .where(and(eq(s.users.id, id), eq(s.users.tenantId, who.tenantId)));
      const { statement: memberAudit } = await prepareAuditInsert(
        who.tenantId,
        null,
        who.email,
        "TEAM_MEMBER_UPDATED",
        "user",
        String(id),
        { status, role },
      );
      await db.batch([memberUpdate, memberAudit]);
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
            .where(
              and(
                eq(s.engagements.jurisdiction, row.code),
                eq(s.engagements.tenantId, who.tenantId),
              ),
            )
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
      const publicId = crypto.randomUUID();
      const trusteeStatus = resignationDate ? "CEASED" : "ACTIVE";
      const trusteeInsert = db
        .insert(s.trustees)
        .values({
          tenantId: who.tenantId,
          publicId,
          clientId,
          personType,
          name,
          email: String(body.email || "").trim() || null,
          role: String(body.role || "Trustee").trim(),
          appointmentDate,
          resignationDate,
          status: trusteeStatus,
        });
      const { statement: trusteeAudit } = await prepareAuditInsert(
        who.tenantId,
        null,
        who.email,
        "GOVERNANCE_PERSON_ADDED",
        "governance_person",
        publicId,
        { clientId, name, personType, status: trusteeStatus },
      );
      await db.batch([trusteeInsert, trusteeAudit]);
    } else if (action === "updateTrustee") {
      const id = Number(body.trusteeId),
        row = (
          await db
            .select()
            .from(s.trustees)
            .where(and(eq(s.trustees.id, id), eq(s.trustees.tenantId, who.tenantId)))
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
      const trusteeUpdate = db
        .update(s.trustees)
        .set(update)
        .where(and(eq(s.trustees.id, id), eq(s.trustees.tenantId, who.tenantId)));
      const { statement: trusteeAudit } = await prepareAuditInsert(
        who.tenantId,
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
      await db.batch([trusteeUpdate, trusteeAudit]);
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
      const existing = (
        await db
          .select()
          .from(s.clientUsers)
          .where(
            and(
              eq(s.clientUsers.tenantId, who.tenantId),
              eq(s.clientUsers.clientId, clientId),
              eq(s.clientUsers.email, email),
            ),
          )
          .limit(1)
      )[0];
      const publicId = existing?.publicId ?? crypto.randomUUID();
      const clientUserMutation = existing
        ? db
            .update(s.clientUsers)
            .set({ name, role, status: "ACTIVE" })
            .where(and(eq(s.clientUsers.id, existing.id), eq(s.clientUsers.tenantId, who.tenantId)))
        : db
            .insert(s.clientUsers)
            .values({ tenantId: who.tenantId, publicId, clientId, name, email, role, status: "ACTIVE" });
      const { statement: clientUserAudit } = await prepareAuditInsert(
        who.tenantId,
        null,
        who.email,
        existing ? "CLIENT_USER_REACTIVATED" : "CLIENT_USER_ADDED",
        "client_user",
        publicId,
        { clientId, email },
      );
      await db.batch([clientUserMutation, clientUserAudit]);
    } else if (action === "updateClientUser") {
      const id = Number(body.clientUserId);
      const row = (
        await db
          .select()
          .from(s.clientUsers)
          .where(and(eq(s.clientUsers.id, id), eq(s.clientUsers.tenantId, who.tenantId)))
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
      const clientUserUpdate = db
        .update(s.clientUsers)
        .set({ status, role })
        .where(and(eq(s.clientUsers.id, id), eq(s.clientUsers.tenantId, who.tenantId)));
      const { statement: clientUserAudit } = await prepareAuditInsert(
        who.tenantId,
        null,
        who.email,
        "CLIENT_USER_UPDATED",
        "client_user",
        String(id),
        { clientId: row.clientId, status, role },
      );
      await db.batch([clientUserUpdate, clientUserAudit]);
    } else if (action === "updateScope") {
      const id = Number(body.engagementId);
      const row = await requireOpen(id);
      if (Number(body.rowVersion) !== row.rowVersion)
        return Response.json(
          { error: "This annual file changed after it was loaded. Refresh before locking it." },
          { status: 409 },
        );
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
      const scopeUpdate = db
        .update(s.engagements)
        .set({ ...update, rowVersion: sql`${s.engagements.rowVersion} + 1` })
        .where(and(eq(s.engagements.id, id), eq(s.engagements.tenantId, who.tenantId)));
      const eligibility = await engagementEligibility({ ...row, ...update });
      const { statement: scopeAudit } = await prepareAuditInsert(
        who.tenantId,
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
      await db.batch([scopeUpdate, scopeAudit]);
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
            .where(and(eq(s.signoffs.engagementId, id), eq(s.signoffs.tenantId, who.tenantId)))
        )
          .filter((signoff) => signoff.type.includes("PREPARED"))
          .map((signoff) => signoff.signedBy.toLowerCase());
        requirePermission(
          !preparedSigners.includes(who.email.toLowerCase()),
          "A person who prepared engagement work cannot complete its independent quality review",
        );
      }
      const now = new Date().toISOString();
      const qualityReviewUpdate = db
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
        .where(and(eq(s.engagements.id, id), eq(s.engagements.tenantId, who.tenantId)));
      const { statement: qualityReviewAudit } = await prepareAuditInsert(
        who.tenantId,
        id,
        who.email,
        "QUALITY_REVIEW_UPDATED",
        "engagement",
        String(id),
        { mode, status },
      );
      await db.batch([qualityReviewUpdate, qualityReviewAudit]);
    }
    if (action === "updatePracticeSettings") {
      const values = {
        concernReviewMode: requireOneOf(
          String(body.concernReviewMode || "EXAMINER_JUDGEMENT"),
          ["ALL", "HIGH_RISK_ONLY", "EXAMINER_JUDGEMENT"],
          "concern review mode",
        ),
        requireIndependentConcernClosure: Boolean(
          body.requireIndependentConcernClosure,
        ),
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
      if (
        !Number.isInteger(values.fileLockDeadlineDays) ||
        values.fileLockDeadlineDays < 1 ||
        values.fileLockDeadlineDays > 365
      )
        return Response.json(
          { error: "File lock deadline must be between 1 and 365 days" },
          { status: 400 },
        );
      if (
        !Number.isInteger(values.retentionYears) ||
        values.retentionYears < 1 ||
        values.retentionYears > 25
      )
        return Response.json(
          { error: "Retention period must be between 1 and 25 years" },
          { status: 400 },
        );
      const settingsUpsert = db
        .insert(s.practiceSettings)
        .values({ tenantId: who.tenantId, ...values })
        .onConflictDoUpdate({
          target: s.practiceSettings.tenantId,
          set: values,
        });
      const { statement: settingsAudit } = await prepareAuditInsert(
        who.tenantId,
        null,
        who.email,
        "PRACTICE_SETTINGS_UPDATED",
        "practice_settings",
        who.tenantId,
        values,
      );
      await db.batch([settingsUpsert, settingsAudit]);
    }
  return true;
}
