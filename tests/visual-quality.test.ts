import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [layout, globals, portal, dialogs, auth, authShell, authForm, clientPortal] = await Promise.all([
  readFile("app/layout.tsx", "utf8"),
  readFile("app/globals.css", "utf8"),
  readFile("app/portal.css", "utf8"),
  readFile("app/dialogs.css", "utf8"),
  readFile("app/auth.css", "utf8"),
  readFile("app/auth/auth-shell.tsx", "utf8"),
  readFile("app/auth/sign-in/auth-form.tsx", "utf8"),
  readFile("components/client-portal.tsx", "utf8"),
]);

test("authoritative visual layers load after the legacy application stylesheet", () => {
  const globalsAt = layout.indexOf('import "./globals.css"');
  const portalAt = layout.indexOf('import "./portal.css"');
  const dialogsAt = layout.indexOf('import "./dialogs.css"');
  const authAt = layout.indexOf('import "./auth.css"');
  assert.ok(globalsAt >= 0 && portalAt > globalsAt && dialogsAt > portalAt && authAt > dialogsAt);
  assert.doesNotMatch(globals, /\.client-dialog-(?:surface|form|content|grid)/);
  assert.doesNotMatch(portal, /\.client-dialog-(?:surface|form|content|grid)/);
});

test("authentication has bounded Fluent geometry and non-overlapping recovery controls", () => {
  assert.match(auth, /grid-template-columns:minmax\(420px,42%\) minmax\(520px,1fr\)/);
  assert.match(auth, /\.auth-card\.fui-Card\{width:min\(448px,100%\)/);
  assert.match(auth, /\.auth-brand-title\{[^}]*clamp\(40px,4vw,56px\)/);
  assert.match(auth, /\.auth-forgot-link\{position:absolute/);
  assert.match(auth, /@media\(max-width:960px\)/);
  assert.match(authShell, /clarity-ie-logo-inverse\.svg/);
  assert.doesNotMatch(authShell, /clarity-ie-logo-dark\.svg/);
  assert.match(authForm, /className="auth-forgot-link"/);
  assert.match(authForm, /<Field className="auth-field" label="Password" required>/);
});

test("the practitioner portal has a useful pre-engagement preview", () => {
  assert.match(clientPortal, /previewMode && !engagement/);
  assert.match(clientPortal, /function PortalEmptyPreview/);
  assert.match(clientPortal, /Awaiting first engagement/);
  assert.match(portal, /\.portal-empty-preview-card/);
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
  for (const [name, css] of [["portal", portal], ["dialogs", dialogs], ["auth", auth]] as const) {
    assert.equal((css.match(/\{/g) ?? []).length, (css.match(/\}/g) ?? []).length, `${name} CSS braces`);
    const sizes = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map((match) => Number(match[1]));
    assert.ok(sizes.every((size) => size >= 9), `${name} contains unreadably small text`);
  }
});

