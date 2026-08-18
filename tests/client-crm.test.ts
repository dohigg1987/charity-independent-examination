import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { optionalEmail } from "../lib/validation";

const crmActions = readFileSync(
  new URL("../lib/state-actions/client-crm.ts", import.meta.url),
  "utf8",
);
const authorization = readFileSync(
  new URL("../lib/state-actions/authorization.ts", import.meta.url),
  "utf8",
);
const stateRoute = readFileSync(
  new URL("../app/api/state/route.ts", import.meta.url),
  "utf8",
);
const workspace = readFileSync(
  new URL("../components/operational-workspace.tsx", import.meta.url),
  "utf8",
);

const LEGACY_TENANT = "00000000-0000-4000-8000-000000000001";
const SECOND_TENANT = "00000000-0000-4000-8000-000000000002";

function migratedDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  const migrationDirectory = new URL("../drizzle/", import.meta.url);
  for (const migration of readdirSync(migrationDirectory)
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort()) {
    db.exec(readFileSync(new URL(migration, migrationDirectory), "utf8"));
  }
  return db;
}

function insertClient(
  db: DatabaseSync,
  tenantId: string,
  publicId: string,
  charityNumber: string,
) {
  return Number(
    db.prepare(
      `INSERT INTO clients (
        tenant_id, public_id, name, charity_number, legal_form,
        contact_name, contact_email
      ) VALUES (?, ?, ?, ?, 'CIO', '', '')`,
    ).run(tenantId, publicId, `${charityNumber} Charity`, charityNumber)
      .lastInsertRowid,
  );
}

test("CRM tables enforce tenant ownership at the database boundary", () => {
  const db = migratedDatabase();
  try {
    db.prepare("INSERT INTO tenants (id, slug, name) VALUES (?, ?, ?)").run(
      SECOND_TENANT,
      "crm-second-practice",
      "CRM Second Practice",
    );
    const firstClient = insertClient(
      db,
      LEGACY_TENANT,
      "10000000-0000-4000-8000-000000000001",
      "CRM-ONE",
    );
    const secondClient = insertClient(
      db,
      SECOND_TENANT,
      "20000000-0000-4000-8000-000000000002",
      "CRM-TWO",
    );

    assert.throws(
      () =>
        db.prepare(
          `INSERT INTO client_contacts
            (tenant_id, public_id, client_id, name)
           VALUES (?, ?, ?, ?)`,
        ).run(
          SECOND_TENANT,
          "30000000-0000-4000-8000-000000000003",
          firstClient,
          "Cross-tenant contact",
        ),
      /tenant|client/i,
      "a contact cannot reference another tenant's client",
    );

    const contactId = Number(
      db.prepare(
        `INSERT INTO client_contacts
          (tenant_id, public_id, client_id, name, email)
         VALUES (?, ?, ?, ?, NULL)`,
      ).run(
        LEGACY_TENANT,
        "40000000-0000-4000-8000-000000000004",
        firstClient,
        "Email-free contact",
      ).lastInsertRowid,
    );
    assert.equal(
      db.prepare("SELECT email FROM client_contacts WHERE id = ?")
        .get(contactId)?.email,
      null,
      "contact email remains optional at rest",
    );

    assert.throws(
      () =>
        db.prepare(
          `INSERT INTO client_activities (
            tenant_id, public_id, client_id, contact_id, subject,
            occurred_at, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          SECOND_TENANT,
          "50000000-0000-4000-8000-000000000005",
          secondClient,
          contactId,
          "Cross-tenant activity",
          "2026-08-18",
          "examiner@example.test",
        ),
      /tenant|contact|client/i,
      "an activity cannot link a contact from another tenant",
    );
  } finally {
    db.close();
  }
});

test("CRM contact email is optional but validated when supplied", () => {
  assert.equal(optionalEmail(""), "");
  assert.equal(optionalEmail(" Contact@Example.ORG "), "contact@example.org");
  assert.throws(() => optionalEmail("invalid"), /valid email/i);
  assert.match(crmActions, /optionalEmail\(String\(body\.email \?\? ""\)\) \|\| null/);
  assert.match(
    workspace,
    /<Field n="email" l="Email \(optional\)" type="email" \/>/,
  );
});

test("CRM activity validation keeps follow-up fields paired and parents tenant scoped", () => {
  assert.match(crmActions, /import \{ RequestSecurityError \}/);
  assert.doesNotMatch(
    crmActions,
    /throw new Error\(/,
    "user-correctable validation errors must not collapse into a generic 500 response",
  );
  assert.match(
    crmActions,
    /eq\(s\.clients\.tenantId, who\.tenantId\)/,
  );
  assert.match(
    crmActions,
    /eq\(s\.engagements\.clientId, clientId\)[\s\S]*eq\(s\.engagements\.tenantId, who\.tenantId\)/,
  );
  assert.match(
    crmActions,
    /eq\(s\.clientContacts\.clientId, clientId\)[\s\S]*eq\(s\.clientContacts\.tenantId, who\.tenantId\)/,
  );
  assert.match(
    crmActions,
    /Boolean\(nextAction\) !== Boolean\(followUpDate\)/,
  );
  assert.match(crmActions, /requireIsoDate\(String\(body\.occurredAt\), "activity date"\)/);
  for (const activityType of ["NOTE", "CALL", "EMAIL", "MEETING", "CLIENT_PORTAL"])
    assert.match(crmActions, new RegExp(`"${activityType}"`));
});

test("follow-up completion is tenant scoped, idempotent and audited", () => {
  assert.match(
    crmActions,
    /eq\(s\.clientActivities\.id, activityId\), eq\(s\.clientActivities\.tenantId, who\.tenantId\)/,
  );
  assert.match(crmActions, /if \(!row\.nextAction \|\| !row\.followUpDate\)/);
  assert.match(crmActions, /if \(row\.completedAt\) return true/);
  assert.match(crmActions, /completedAt, completedBy: who\.email/);
  assert.match(crmActions, /"CLIENT_FOLLOW_UP_COMPLETED"/);
  assert.match(
    crmActions,
    /await db\.batch\(\[update, audit\]\)/,
    "completion and its audit event are committed atomically",
  );
});

test("CRM actions are authorised, routed and wired to visible controls", () => {
  for (const action of [
    "createClientContact",
    "updateClientContact",
    "createClientActivity",
    "completeClientFollowUp",
  ]) {
    assert.match(authorization, new RegExp(`"${action}"`));
    assert.match(crmActions, new RegExp(`"${action}"`));
    assert.match(workspace, new RegExp(`mutate\\("${action}"`));
  }
  assert.match(stateRoute, /handleClientCrmAction/);
  assert.match(stateRoute, /handleClientWorkpaperAction,[\s\S]*handleClientCrmAction/);
});
