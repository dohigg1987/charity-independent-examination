import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { RequestSecurityError } from "../lib/file-security";
import { optionalEmail } from "../lib/validation";

test("optional email accepts an omitted client contact", () => {
  assert.equal(optionalEmail(""), "");
  assert.equal(optionalEmail("   "), "");
});

test("optional email normalises valid addresses when supplied", () => {
  assert.equal(optionalEmail(" Contact@Example.ORG "), "contact@example.org");
});

test("optional email rejects invalid addresses when supplied", () => {
  assert.throws(() => optionalEmail("not-an-email"), RequestSecurityError);
});

test("client setup wires contact email as an optional field", async () => {
  const [actions, workspace] = await Promise.all([
    readFile("lib/state-actions/client-workpapers.ts", "utf8"),
    readFile("components/operational-workspace.tsx", "utf8"),
  ]);

  assert.match(actions, /if \(!body\.name \|\| !body\.charityNumber\)/);
  assert.match(
    actions,
    /contactEmail: optionalEmail\(String\(body\.contactEmail \|\| ""\)\)/,
  );
  assert.match(workspace, /l="Contact email \(optional\)"/);
  assert.doesNotMatch(
    workspace,
    /n="contactEmail"[\s\S]{0,160}required/,
  );
});
