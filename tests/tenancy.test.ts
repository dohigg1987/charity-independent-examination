import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync(new URL("../db/schema.ts", import.meta.url), "utf8");
const stateRoute = readFileSync(
  new URL("../app/api/state/route.ts", import.meta.url),
  "utf8",
);
const workpaperActions = readFileSync(
  new URL("../lib/state-actions/client-workpapers.ts", import.meta.url),
  "utf8",
);
const concernActions = readFileSync(
  new URL("../lib/state-actions/concerns-lock.ts", import.meta.url),
  "utf8",
);
const filesRoute = readFileSync(
  new URL("../app/api/files/route.ts", import.meta.url),
  "utf8",
);
const tbRoute = readFileSync(
  new URL("../app/api/tb/route.ts", import.meta.url),
  "utf8",
);
const tenantMigration = readFileSync(
  new URL("../drizzle/0014_spooky_black_bolt.sql", import.meta.url),
  "utf8",
);
const provisioning = readFileSync(
  new URL("../lib/tenant-provisioning.ts", import.meta.url),
  "utf8",
);

const operationalTables = [
  "users",
  "clients",
  "engagements",
  "tasks",
  "procedures",
  "workpaperVersions",
  "evidenceRequests",
  "conversationThreads",
  "conversationParticipants",
  "conversationMessages",
  "documents",
  "permanentDocuments",
  "comments",
  "reviewNotes",
  "signoffs",
  "invitations",
  "trustees",
  "clientUsers",
  "auditEvents",
  "concerns",
  "concernEvents",
  "fileLockEvents",
  "tbImports",
  "tbAccounts",
  "tbAnalytics",
  "tbReconciliations",
] as const;

test("every operational table declares tenant ownership and an opaque public id", () => {
  for (const table of operationalTables) {
    const declaration = schema.indexOf(`export const ${table}`);
    assert.notEqual(declaration, -1, `${table} is declared`);
    const nextDeclaration = schema.indexOf("export const ", declaration + 13);
    const body = schema.slice(
      declaration,
      nextDeclaration === -1 ? schema.length : nextDeclaration,
    );
    assert.match(body, /\.\.\.tenantColumns\(\)/, `${table} is tenant owned`);
  }
});

test("tenant migration backfills all operational tables and installs guards", () => {
  for (const table of operationalTables) {
    const sqlName = table.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    assert.match(
      tenantMigration,
      new RegExp("UPDATE `" + sqlName + "` SET `tenant_id`"),
      `${sqlName} is backfilled`,
    );
    assert.match(
      tenantMigration,
      new RegExp("CREATE TRIGGER `" + sqlName + "_tenant_insert_guard`"),
      `${sqlName} rejects unscoped inserts`,
    );
  }
});

test("request handlers do not execute development seeding", () => {
  for (const source of [stateRoute, filesRoute, tbRoute])
    assert.doesNotMatch(source, /seedIfEmpty/);
});

test("tenant provisioning is control-plane only and atomic", () => {
  assert.match(provisioning, /intentionally not reachable from an application route/);
  assert.match(provisioning, /db\.batch\(\[/);
  assert.match(provisioning, /db\.insert\(s\.tenants\)/);
  assert.match(provisioning, /db\.insert\(s\.practiceSettings\)/);
  assert.match(provisioning, /db\.insert\(s\.users\)/);
});

test("object storage paths are tenant prefixed", () => {
  assert.match(filesRoute, /tenants\/\$\{who\.tenantId\}/);
  assert.match(tbRoute, /tenants\/\$\{who\.tenantId\}/);
});

test("critical sign-off and file-lock workflows use atomic D1 batches", () => {
  assert.match(workpaperActions, /db\.batch\(\[taskUpdate, versionInsert, signoffInsert, auditInsert\]\)/);
  assert.match(concernActions, /db\.batch\(\[lockUpdate, lockEvent, lockAudit\]\)/);
  assert.match(concernActions, /db\.batch\(\[reopenUpdate, reopenEvent, reopenAudit\]\)/);
});
