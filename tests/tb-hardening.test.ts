import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(
  new URL("../app/api/tb/route.ts", import.meta.url),
  "utf8",
);

test("trial-balance mutations and their audit events are submitted atomically", () => {
  assert.match(route, /statements = \[accountUpdate, \.\.\.reconciliationStatements, auditInsert\]/);
  assert.match(route, /db\.batch\(\[reconciliationUpdate, auditInsert\]\)/);
  assert.match(route, /db\.batch\(\[requestInsert, auditInsert\]\)/);
  assert.match(route, /return statements;/);
  assert.doesNotMatch(route, /await rebuildReconciliations/);
  assert.doesNotMatch(route, /await audit\(/);
});

test("every prepared trial-balance audit uses the non-executing statement wrapper", () => {
  const calls = [...route.matchAll(/prepareAuditInsert\(/g)].length;
  const statementAccesses = [...route.matchAll(/\)\s*\.statement/g)].length;
  const statementDestructures = [
    ...route.matchAll(/\{ statement: auditInsert \} = await prepareAuditInsert/g),
  ].length;
  assert.equal(calls, statementAccesses + statementDestructures);
});

test("trial-balance storage and finding references expose no integer engagement id", () => {
  assert.match(route, /engagementPublicId: engagement\.publicId/);
  assert.doesNotMatch(route, /engagementId: String\(engagementId\)/);
  assert.match(route, /FND-\$\{engagement\.publicId\.slice\(0, 8\)/);
  assert.doesNotMatch(route, /FND-\$\{engagementId\}/);
});
