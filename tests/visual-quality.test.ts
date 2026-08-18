import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [layout, globals, portal, dialogs] = await Promise.all([
  readFile("app/layout.tsx", "utf8"),
  readFile("app/globals.css", "utf8"),
  readFile("app/portal.css", "utf8"),
  readFile("app/dialogs.css", "utf8"),
]);

test("authoritative visual layers load after the legacy application stylesheet", () => {
  const globalsAt = layout.indexOf('import "./globals.css"');
  const portalAt = layout.indexOf('import "./portal.css"');
  const dialogsAt = layout.indexOf('import "./dialogs.css"');
  assert.ok(globalsAt >= 0 && portalAt > globalsAt && dialogsAt > portalAt);
  assert.doesNotMatch(globals, /\.client-dialog-(?:surface|form|content|grid)/);
  assert.doesNotMatch(portal, /\.client-dialog-(?:surface|form|content|grid)/);
});

test("the client dialog preserves one coherent Fluent grid at every viewport", () => {
  assert.match(dialogs, /width:\s*min\(480px,\s*calc\(100vw - 32px\)\)/);
  assert.match(dialogs, /grid-template-columns:\s*minmax\(0,1fr\)\s*!important/);
  assert.match(dialogs, /grid-template-areas:\s*"title" "content" "actions"\s*!important/);
  assert.match(dialogs, /\.fui-DialogTitle\s*\{[\s\S]*?grid-area:\s*title\s*!important/);
  assert.match(dialogs, /\.client-dialog-content\s*\{[\s\S]*?grid-area:\s*content\s*!important/);
  assert.match(dialogs, /\.fui-DialogActions\s*\{[\s\S]*?grid-area:\s*actions\s*!important/);
  assert.match(dialogs, /\.client-dialog-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,1fr\)/);
  assert.doesNotMatch(dialogs, /\.client-dialog-form\s*>\s*\.fui-DialogBody\s*\{[^}]*display:\s*flex/);
});

test("critical visual styles remain syntactically balanced and readable", () => {
  for (const [name, css] of [["portal", portal], ["dialogs", dialogs]] as const) {
    assert.equal((css.match(/\{/g) ?? []).length, (css.match(/\}/g) ?? []).length, `${name} CSS braces`);
    const sizes = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((match) => Number(match[1]));
    assert.ok(sizes.every((size) => size >= 9), `${name} contains unreadably small text`);
  }
});

