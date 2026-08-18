import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import * as s from "@/db/schema";
import type { Principal } from "@/lib/authz";
import { RequestSecurityError } from "@/lib/file-security";
import { prepareAuditInsert } from "@/lib/server-data";
import { optionalEmail, requireIsoDate, requireOneOf } from "@/lib/validation";

const actions = new Set([
  "createClientContact",
  "updateClientContact",
  "createClientActivity",
  "completeClientFollowUp",
]);

function text(value: unknown, label: string, max = 500, required = false) {
  const result = String(value ?? "").trim();
  if (required && !result) throw new RequestSecurityError(`${label} is required`, 400);
  if (result.length > max) throw new RequestSecurityError(`${label} is too long`, 400);
  return result;
}

function checked(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true" || value === "on";
}

async function clientForTenant(clientId: number, who: Principal) {
  const row = (await getDb().select().from(s.clients).where(and(
    eq(s.clients.id, clientId), eq(s.clients.tenantId, who.tenantId),
  )).limit(1))[0];
  if (!row) throw new RequestSecurityError("Client not found", 404);
  return row;
}

async function validateActivityParents(
  clientId: number,
  engagementId: number | null,
  contactId: number | null,
  who: Principal,
) {
  await clientForTenant(clientId, who);
  if (engagementId) {
    const engagement = (await getDb().select({ id: s.engagements.id }).from(s.engagements).where(and(
      eq(s.engagements.id, engagementId), eq(s.engagements.clientId, clientId),
      eq(s.engagements.tenantId, who.tenantId),
    )).limit(1))[0];
    if (!engagement) throw new RequestSecurityError("The linked engagement does not belong to this client", 400);
  }
  if (contactId) {
    const contact = (await getDb().select({ id: s.clientContacts.id }).from(s.clientContacts).where(and(
      eq(s.clientContacts.id, contactId), eq(s.clientContacts.clientId, clientId),
      eq(s.clientContacts.tenantId, who.tenantId),
    )).limit(1))[0];
    if (!contact) throw new RequestSecurityError("The linked contact does not belong to this client", 400);
  }
}

export async function handleClientCrmAction(
  action: string,
  body: Record<string, unknown>,
  who: Principal,
): Promise<Response | true | false> {
  if (!actions.has(action)) return false;
  const db = getDb();

  if (action === "createClientContact") {
    const clientId = Number(body.clientId);
    await clientForTenant(clientId, who);
    const publicId = crypto.randomUUID();
    const name = text(body.name, "Contact name", 200, true);
    const isPrimary = checked(body.isPrimary);
    const clearPrimary = db.update(s.clientContacts).set({ isPrimary: false }).where(and(
      eq(s.clientContacts.clientId, clientId), eq(s.clientContacts.tenantId, who.tenantId),
    ));
    const insert = db.insert(s.clientContacts).values({
      tenantId: who.tenantId, publicId, clientId, name,
      role: text(body.role, "Role", 160),
      email: optionalEmail(String(body.email ?? "")) || null,
      phone: text(body.phone, "Phone", 80) || null,
      isPrimary,
    });
    const { statement: audit } = await prepareAuditInsert(who.tenantId, null, who.email,
      "CLIENT_CONTACT_CREATED", "client_contact", publicId, { clientId, name });
    if (isPrimary) await db.batch([clearPrimary, insert, audit]);
    else await db.batch([insert, audit]);
    return true;
  }

  if (action === "updateClientContact") {
    const contactId = Number(body.contactId);
    const row = (await db.select().from(s.clientContacts).where(and(
      eq(s.clientContacts.id, contactId), eq(s.clientContacts.tenantId, who.tenantId),
    )).limit(1))[0];
    if (!row) throw new RequestSecurityError("Contact not found", 404);
    const isPrimary = Object.hasOwn(body, "isPrimary") ? checked(body.isPrimary) : row.isPrimary;
    const status = requireOneOf(String(body.status ?? row.status), ["ACTIVE", "INACTIVE"], "contact status");
    if (isPrimary && status !== "ACTIVE") throw new RequestSecurityError("An inactive contact cannot be primary", 400);
    const clearPrimary = db.update(s.clientContacts).set({ isPrimary: false }).where(and(
      eq(s.clientContacts.clientId, row.clientId), eq(s.clientContacts.tenantId, who.tenantId),
    ));
    const update = db.update(s.clientContacts).set({
      name: text(body.name ?? row.name, "Contact name", 200, true),
      role: text(body.role ?? row.role, "Role", 160),
      email: optionalEmail(String(body.email ?? row.email ?? "")) || null,
      phone: text(body.phone ?? row.phone, "Phone", 80) || null,
      isPrimary, status, updatedAt: new Date().toISOString(),
    }).where(and(eq(s.clientContacts.id, contactId), eq(s.clientContacts.tenantId, who.tenantId)));
    const { statement: audit } = await prepareAuditInsert(who.tenantId, null, who.email,
      "CLIENT_CONTACT_UPDATED", "client_contact", String(contactId), { clientId: row.clientId, status });
    if (isPrimary) await db.batch([clearPrimary, update, audit]);
    else await db.batch([update, audit]);
    return true;
  }

  if (action === "createClientActivity") {
    const clientId = Number(body.clientId);
    const engagementId = body.engagementId ? Number(body.engagementId) : null;
    const contactId = body.contactId ? Number(body.contactId) : null;
    await validateActivityParents(clientId, engagementId, contactId, who);
    const nextAction = text(body.nextAction, "Next action", 500);
    const followUpDate = body.followUpDate ? requireIsoDate(String(body.followUpDate), "follow-up date") : null;
    if (Boolean(nextAction) !== Boolean(followUpDate))
      throw new RequestSecurityError("Next action and follow-up date must be recorded together", 400);
    const publicId = crypto.randomUUID();
    const subject = text(body.subject, "Activity subject", 300, true);
    const activityType = requireOneOf(String(body.activityType ?? "NOTE"),
      ["NOTE", "CALL", "EMAIL", "MEETING", "CLIENT_PORTAL"], "activity type");
    const occurredAt = requireIsoDate(String(body.occurredAt), "activity date");
    const insert = db.insert(s.clientActivities).values({
      tenantId: who.tenantId, publicId, clientId, engagementId, contactId,
      activityType, subject, detail: text(body.detail, "Activity detail", 10_000),
      occurredAt, nextAction, followUpDate, createdBy: who.email,
    });
    const { statement: audit } = await prepareAuditInsert(who.tenantId, engagementId, who.email,
      "CLIENT_ACTIVITY_CREATED", "client_activity", publicId,
      { clientId, engagementId, contactId, activityType, subject, followUpDate });
    await db.batch([insert, audit]);
    return true;
  }

  const activityId = Number(body.activityId);
  const row = (await db.select().from(s.clientActivities).where(and(
    eq(s.clientActivities.id, activityId), eq(s.clientActivities.tenantId, who.tenantId),
  )).limit(1))[0];
  if (!row) throw new RequestSecurityError("Client activity not found", 404);
  if (!row.nextAction || !row.followUpDate) throw new RequestSecurityError("This activity has no follow-up to complete", 400);
  if (row.completedAt) return true;
  const completedAt = new Date().toISOString();
  const update = db.update(s.clientActivities).set({ completedAt, completedBy: who.email }).where(and(
    eq(s.clientActivities.id, activityId), eq(s.clientActivities.tenantId, who.tenantId),
  ));
  const { statement: audit } = await prepareAuditInsert(who.tenantId, row.engagementId, who.email,
    "CLIENT_FOLLOW_UP_COMPLETED", "client_activity", String(activityId),
    { clientId: row.clientId, engagementId: row.engagementId, followUpDate: row.followUpDate });
  await db.batch([update, audit]);
  return true;
}
