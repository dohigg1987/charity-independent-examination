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

test("development state reads initialise preview data before rendering", async () => {
  const route = await readFile("app/api/state/route.ts", "utf8");
  assert.match(
    route,
    /export async function GET\(\) \{\s*try \{\s*await seedIfEmpty\(\);/,
  );
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
  const [state, files] = await Promise.all([
    readFile("app/api/state/route.ts", "utf8"),
    readFile("app/api/files/route.ts", "utf8"),
  ]);
  assert.match(state, /This conversation is not assigned to the signed-in account/);
  assert.match(files, /This evidence request is not assigned to the signed-in account/);
  assert.match(files, /This document is not assigned to the signed-in account/);
  assert.match(files, /s\.conversationParticipants\.email/);
});

test("uploads record signature-verification status rather than a false clean status", async () => {
  const source = await readFile("app/api/files/route.ts", "utf8");
  assert.match(source, /SIGNATURE_VERIFIED/);
  assert.doesNotMatch(source, /malwareStatus:\s*"STORED"/);
});

test("audit records are hash chained", async () => {
  const source = await readFile("lib/server-data.ts", "utf8");
  assert.match(source, /previousHash: previous/);
  assert.match(source, /eventHash/);
});
