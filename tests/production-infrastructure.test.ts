import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { translateSql } from "../db/postgres-d1";

test("Postgres compatibility preserves quoted question marks and numbers parameters", () => {
  assert.equal(
    translateSql(`SELECT * FROM "users" WHERE "email" = ? AND "note" = '?' AND "tenant_id" = ?`),
    `SELECT * FROM "users" WHERE "email" = $1 AND "note" = '?' AND "tenant_id" = $2`,
  );
});

test("production environments are Clarity-owned and isolated", async () => {
  const environments = JSON.parse(await readFile(new URL("../deployment/environments.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(environments), ["dev", "test", "preprod", "production"]);
  const serialized = JSON.stringify(environments);
  assert.doesNotMatch(serialized, /quotebench/i);
  for (const [name, environment] of Object.entries(environments) as [string, { worker: string; r2Bucket: string }][]) {
    assert.match(environment.worker, new RegExp(`^clarity-ie-${name}$`));
    assert.match(environment.r2Bucket, new RegExp(`^clarity-ie-${name}-files$`));
  }
});

test("promotion requires the exact prior environment tag", async () => {
  const workflow = await readFile(new URL("../.github/workflows/promote.yml", import.meta.url), "utf8");
  assert.match(workflow, /deployed-\$\{prerequisite\}-\$\{COMMIT_SHA\}/);
  assert.match(workflow, /git merge-base --is-ancestor/);
  assert.match(workflow, /Automatic rollback/);
  assert.match(workflow, /Production canary/);
});

