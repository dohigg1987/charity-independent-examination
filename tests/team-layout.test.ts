import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("team access cards keep identity, contact and actions in dedicated layout regions", async () => {
  const [workspace, styles] = await Promise.all([
    readFile("components/operational-workspace.tsx", "utf8"),
    readFile("app/globals.css", "utf8"),
  ]);

  assert.match(workspace, /className="team-management"/);
  assert.match(workspace, /className="team-member-contact"/);
  assert.match(workspace, /className="team-member-action"/);
  assert.match(workspace, /team-member-status/);
  assert.doesNotMatch(workspace, /className="avatar large"/);

  assert.match(
    styles,
    /\.team-member-card\{display:grid;grid-template-columns:52px minmax\(0,1fr\) auto;/,
  );
  assert.match(styles, /\.team-member-action \.secondary\{min-width:158px;white-space:nowrap\}/);
  assert.match(
    styles,
    /@media\(max-width:700px\)[\s\S]*\.team-member-action\{grid-column:1\/-1;/,
  );
  assert.match(styles, /\.team-member-contact a\{[^}]*overflow-wrap:anywhere;/);
});
