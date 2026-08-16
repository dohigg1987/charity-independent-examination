import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the controlled concern lifecycle is implemented across API and workspace", async () => {
  const [actions, workspace] = await Promise.all([
    readFile("lib/state-actions/concerns-lock.ts", "utf8"),
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
    assert.match(actions, new RegExp(`action === "${action}"`));
    assert.match(workspace, new RegExp(`"${action}"`));
  }
  assert.doesNotMatch(workspace, /mutate\("resolveConcern"/);
  assert.match(actions, /closureHash/);
  assert.match(actions, /CONCERN_REOPENED/);
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
  const [actions, workspace] = await Promise.all([
    readFile("lib/state-actions/practice-admin.ts", "utf8"),
    readFile("components/operational-workspace.tsx", "utf8"),
  ]);

  assert.match(actions, /saveAndPublishJurisdictionRuleSet/);
  assert.match(actions, /planRulePublication/);
  assert.match(actions, /db\.batch/);
  assert.match(workspace, /Save &amp; publish version/);
  assert.match(workspace, /sourceRuleSetId/);
});

test("quality, access and governance controls are persistent server actions", async () => {
  const actions = await readFile("lib/state-actions/practice-admin.ts", "utf8");

  assert.match(actions, /updatePracticeSettings/);
  assert.match(actions, /cannot deactivate their own account/i);
  assert.match(actions, /last active practice administrator/i);
  assert.match(actions, /termination date is required/i);
  assert.match(actions, /termination date cannot precede/i);
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
