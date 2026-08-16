import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("browser state and mutations use opaque tenant-scoped identifiers", async () => {
  const [boundary, state, types] = await Promise.all([
    readFile("lib/public-ids.ts", "utf8"),
    readFile("app/api/state/route.ts", "utf8"),
    readFile("lib/types.ts", "utf8"),
  ]);
  assert.match(boundary, /must be an opaque UUID/);
  assert.match(boundary, /AND tenant_id =/);
  assert.match(boundary, /externaliseState/);
  assert.match(state, /resolvePublicBodyIds\(who\.tenantId, input\)/);
  assert.match(types, /export type PublicId = string/);
  assert.match(types, /id: PublicId/);
});

test("file, trial-balance and report endpoints reject private numeric identifiers", async () => {
  const [files, tb, report] = await Promise.all([
    readFile("app/api/files/route.ts", "utf8"),
    readFile("app/api/tb/route.ts", "utf8"),
    readFile("app/api/report/route.ts", "utf8"),
  ]);
  assert.match(files, /resolvePublicId\(who\.tenantId, "document"/);
  assert.match(files, /resolveOptionalPublicId\(who\.tenantId, "engagement"/);
  assert.match(tb, /resolvePublicBodyIds\(who\.tenantId, input\)/);
  assert.match(tb, /resolvePublicId\(who\.tenantId, "engagement"/);
  assert.match(report, /resolvePublicId\(who\.tenantId,"engagement"/);
});
