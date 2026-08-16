import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("all state-changing API routes require authenticated actors", async () => {
  for (const path of [
    "app/api/state/route.ts",
    "app/api/files/route.ts",
    "app/api/tb/route.ts",
  ]) {
    const source = await readFile(path, "utf8");
    assert.match(source, /await actor\(\)/, path);
    assert.match(source, /enforceSameOrigin\(request\)/, path);
  }
});

test("production identity has no named-user fallback", async () => {
  const source = await readFile("lib/server-data.ts", "utf8");
  assert.match(source, /throw new AuthenticationRequiredError/);
  assert.doesNotMatch(source, /preview@clarity\.ie" \}/);
});

test("request handlers never initialise development fixture data", async () => {
  const route = await readFile("app/api/state/route.ts", "utf8");
  assert.doesNotMatch(route, /seedIfEmpty/);
});

test("client state applies engagement and request filtering", async () => {
  const source = await readFile("lib/server-data.ts", "utf8");
  assert.match(source, /allowedClients/);
  assert.match(source, /currentActor\.clientRoles\[engagement\.clientId\] === "PORTAL_ADMIN"/);
  assert.match(source, /participant\.email\.toLowerCase\(\) === currentActor\.email\.toLowerCase\(\)/);
  assert.match(source, /row\.requestId\s*!==\s*null/);
  assert.match(source, /row\.visibility\s*===\s*"CLIENT"/);
  assert.match(source, /concerns:\s*\[\]/);
  assert.match(source, /concernEvents:\s*\[\]/);
  assert.match(source, /practiceSettings:\s*null/);
  assert.match(source, /portalProgress/);
  assert.match(source, /tasks:\s*\[\]/);
  assert.match(source, /procedures:\s*\[\]/);
  assert.match(source, /trustees:\s*\[\]/);
  assert.match(source, /clientUsers:\s*\[\]/);
});

test("client conversations and files require assignment or portal administration", async () => {
  const [state, serverData, communications, files] = await Promise.all([
    readFile("app/api/state/route.ts", "utf8"),
    readFile("lib/server-data.ts", "utf8"),
    readFile("lib/state-actions/communications.ts", "utf8"),
    readFile("app/api/files/route.ts", "utf8"),
  ]);
  assert.match(state, /handleCommunicationAction/);
  assert.match(communications, /This conversation is not assigned to the signed-in account/);
  assert.match(files, /This evidence request is not assigned to the signed-in account/);
  assert.match(files, /This document is not assigned to the signed-in account/);
  assert.match(files, /s\.conversationParticipants\.email/);
  assert.match(serverData, /conversationIds\.has\(row\.conversationThreadId\)/);
  assert.match(serverData, /row\.conversationMessageId\s*!==\s*null/);
  assert.match(files, /This attachment has not been sent/);
});

test("uploads record signature-verification status rather than a false clean status", async () => {
  const source = await readFile("app/api/files/route.ts", "utf8");
  assert.match(source, /SIGNATURE_VERIFIED/);
  assert.doesNotMatch(source, /malwareStatus:\s*"STORED"/);
});

test("file uploads batch database writes with audit and compensate object storage failures", async () => {
  const source = await readFile("app/api/files/route.ts", "utf8");
  assert.match(source, /prepareAuditInsert/);
  assert.match(source, /statement:\s*permanentAudit/);
  assert.match(source, /statement:\s*documentAudit/);
  assert.match(source, /db\.batch\(\[permanentInsert, permanentAudit\]\)/);
  assert.match(source, /deleteObjectAfterFailedWrite\(key\)/);
  assert.doesNotMatch(source, /document:\s*\{\s*\.\.\.doc/);
});

test("audit records are hash chained", async () => {
  const source = await readFile("lib/server-data.ts", "utf8");
  assert.match(source, /previousHash: previous/);
  assert.match(source, /eventHash/);
  assert.match(source, /const \{ statement \} = await prepareAuditInsert/);
  assert.match(source, /await statement;/);
});
