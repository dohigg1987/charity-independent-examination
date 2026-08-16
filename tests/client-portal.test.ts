import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  choosePortalEngagement,
  isRequestOverdue,
  portalCompletion,
} from "../lib/client-portal";

test("portal progress is calculated from the actual controlled programme", () => {
  assert.equal(portalCompletion(13, 7), 54);
  assert.equal(portalCompletion(0, 0), 0);
  assert.equal(portalCompletion(3, 5), 100);
  assert.equal(portalCompletion(4, -1), 0);
});

test("request deadlines remain actionable through the due date", () => {
  assert.equal(isRequestOverdue("2026-08-16", "AWAITING_CLIENT", "2026-08-16"), false);
  assert.equal(isRequestOverdue("2026-08-15", "AWAITING_CLIENT", "2026-08-16"), true);
  assert.equal(isRequestOverdue("2026-08-15", "RECEIVED", "2026-08-16"), false);
  assert.equal(isRequestOverdue("2026-08-20", "OVERDUE", "2026-08-16"), true);
});

test("engagement selection preserves a valid active file and falls back safely", () => {
  assert.equal(choosePortalEngagement([11, 12], 12, 11), 12);
  assert.equal(choosePortalEngagement([11, 12], 99, 11), 11);
  assert.equal(choosePortalEngagement([11, 12], null, 99), 11);
  assert.equal(choosePortalEngagement([], null, null), null);
});

test("portal response and receipt controls are implemented as request-scoped journeys", async () => {
  const [portal, files, stateRoute] = await Promise.all([
    readFile("components/client-portal.tsx", "utf8"),
    readFile("app/api/files/route.ts", "utf8"),
    readFile("app/api/state/route.ts", "utf8"),
  ]);

  assert.match(portal, /Record<number, ResponseDraft>/);
  assert.match(portal, /form\.set\("message", draft\.note\.trim\(\)\)/);
  assert.match(portal, /Receipt \$\{receipt\.sha256\.slice/);
  assert.match(portal, /state\.actor\.name/);
  assert.match(portal, /examinerName/);
  assert.match(portal, /canRespond=\{canRespond\}/);
  assert.doesNotMatch(portal, /\/\s*13\)\s*\*/);

  assert.match(files, /body: responseNote \|\| `Uploaded evidence:/);
  assert.match(files, /responseIncluded: Boolean\(responseNote\)/);
  assert.match(stateRoute, /\.set\(\{ status: "RECEIVED", receivedAt: now \}\)/);
  assert.match(stateRoute, /status: statusAfterMessage\(who\.kind\)/);
});

test("mobile inbox navigation can return to a thread list", async () => {
  const messages = await readFile("components/client-messages.tsx", "utf8");
  assert.match(messages, /selectedId === null\s*\? null/);
  assert.match(messages, /back=\{\(\) => setSelectedId\(null\)\}/);
  assert.match(messages, /!canRespond \? \(/);
  assert.match(messages, /No secure conversations are currently available/);
});

test("the customer portal rejects unassigned identities and gives practitioners a read-only preview", async () => {
  const [page, portal] = await Promise.all([
    readFile("app/client/page.tsx", "utf8"),
    readFile("components/client-portal.tsx", "utf8"),
  ]);
  assert.match(page, /principal = await actor\(\)/);
  assert.match(page, /error instanceof AccessDeniedError/);
  assert.match(page, /previewMode=\{principal\.kind === "INTERNAL"\}/);
  assert.match(portal, /!previewMode && clientRole !== "READ_ONLY"/);
  assert.match(portal, /Read-only practitioner preview/);
  assert.match(portal, /Messages,\s*responses and uploads are disabled in preview mode/);
});

test("the customer portal has narrow-screen layout controls", async () => {
  const css = await readFile("app/globals.css", "utf8");
  assert.match(css, /@media\(max-width:820px\)[\s\S]*?\.portal-nav\{position:fixed/);
  assert.match(css, /@media\(max-width:560px\)[\s\S]*?\.portal-engagement-switcher/);
  assert.match(css, /@media\(max-width:560px\)[\s\S]*?\.portal-identity\{display:none\}/);
});
