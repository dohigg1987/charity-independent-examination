import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the controlled concern lifecycle is implemented across API and workspace", async () => {
  const [route, workspace] = await Promise.all([
    readFile("app/api/state/route.ts", "utf8"),
    readFile("components/operational-workspace.tsx", "utf8"),
  ]);

  for (const action of [
    "createConcern",
    "updateConcern",
    "addConcernEvent",
    "submitConcernForReview",
    "reviewConcern",
    "reopenConcern",
  ]) {
    assert.match(route, new RegExp(`action === "${action}"`));
    assert.match(workspace, new RegExp(`"${action}"`));
  }
  assert.doesNotMatch(workspace, /mutate\("resolveConcern"/);
  assert.match(route, /closureHash/);
  assert.match(route, /CONCERN_REOPENED/);
});

test("concern evidence is linked, authorised and hash-controlled", async () => {
  const [schema, files] = await Promise.all([
    readFile("db/schema.ts", "utf8"),
    readFile("app/api/files/route.ts", "utf8"),
  ]);

  assert.match(schema, /concernId: integer\("concern_id"\)/);
  assert.match(files, /concernId/);
  assert.match(files, /concern\.engagementId !== engagementId/);
  assert.match(files, /sha256/);
});

test("rule publication saves visible values and closes its predecessor atomically", async () => {
  const [route, workspace] = await Promise.all([
    readFile("app/api/state/route.ts", "utf8"),
    readFile("components/operational-workspace.tsx", "utf8"),
  ]);

  assert.match(route, /saveAndPublishJurisdictionRuleSet/);
  assert.match(route, /planRulePublication/);
  assert.match(route, /db\.batch/);
  assert.match(workspace, /Save &amp; publish version/);
  assert.match(workspace, /sourceRuleSetId/);
});

test("quality, access and governance controls are persistent server actions", async () => {
  const route = await readFile("app/api/state/route.ts", "utf8");

  assert.match(route, /updatePracticeSettings/);
  assert.match(route, /cannot deactivate their own account/i);
  assert.match(route, /last active practice administrator/i);
  assert.match(route, /termination date is required/i);
  assert.match(route, /termination date cannot precede/i);
});

test("migration preserves legacy concerns before enforcing unique references", async () => {
  const migration = await readFile("drizzle/0012_smart_cerise.sql", "utf8");
  const backfill = migration.indexOf("UPDATE `concerns` SET `reference`");
  const uniqueIndex = migration.indexOf("CREATE UNIQUE INDEX `concerns_reference_idx`");

  assert.ok(backfill >= 0);
  assert.ok(uniqueIndex > backfill);
  assert.match(migration, /`engagement_id` \|\| '-' \|\| printf/);
  assert.match(migration, /INSERT INTO `concern_events`/);
});
