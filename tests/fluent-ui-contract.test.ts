import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = source("app/layout.tsx");
const provider = source("components/fluent/clarity-fluent-provider.tsx");
const theme = source("components/fluent/clarity-theme.ts");
const workspace = source("components/operational-workspace.tsx");
const practitionerMessages = source("components/communications-workspace.tsx");
const clientMessages = source("components/client-messages.tsx");
const packageJson = JSON.parse(source("package.json")) as {
  dependencies?: Record<string, string>;
};

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function namedImports(sourceText: string, packageName: string) {
  const escapedPackage = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = sourceText.match(
    new RegExp(`import\\s*\\{([\\s\\S]*?)\\}\\s*from\\s*["']${escapedPackage}["']`),
  );
  assert.ok(match, `expected named imports from ${packageName}`);
  return match[1];
}

function sourceSection(sourceText: string, start: string, end: string) {
  const startIndex = sourceText.indexOf(start);
  const endIndex = sourceText.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing source section start: ${start}`);
  assert.notEqual(endIndex, -1, `missing source section end: ${end}`);
  return sourceText.slice(startIndex, endIndex);
}

function fieldMarkup(sourceText: string, name: string) {
  const nameIndex = sourceText.indexOf(`n="${name}"`);
  assert.notEqual(nameIndex, -1, `missing ${name} field`);
  const startIndex = sourceText.lastIndexOf("<Field", nameIndex);
  const endIndex = sourceText.indexOf("/>", nameIndex);
  assert.notEqual(startIndex, -1, `missing ${name} Field start`);
  assert.notEqual(endIndex, -1, `missing ${name} Field end`);
  return sourceText.slice(startIndex, endIndex + 2);
}

test("the application root supplies the Clarity Fluent 2 theme, including portals", () => {
  assert.match(
    packageJson.dependencies?.["@fluentui/react-components"] ?? "",
    /^\^?9\./,
    "Fluent UI React v9 must remain a production dependency",
  );
  assert.match(layout, /import \{ ClarityFluentProvider \}/);
  assert.match(
    layout,
    /<ClarityFluentProvider>\s*\{children\}\s*<\/ClarityFluentProvider>/,
  );
  assert.match(provider, /<FluentProvider\b/);
  assert.match(provider, /theme=\{clarityLightTheme\}/);
  assert.match(
    provider,
    /\bapplyStylesToPortals\b/,
    "dialogs and other portal content must inherit the Clarity theme",
  );
  assert.match(theme, /createLightTheme\(clarityBrand\)/);
  assert.match(theme, /fontFamilyBase:\s*[\s\S]*Segoe UI/);
});

test("core operational controls use official Fluent dialogs, fields and tabs", () => {
  const imports = namedImports(workspace, "@fluentui/react-components");
  for (const component of [
    "Button",
    "Dialog",
    "DialogActions",
    "DialogSurface",
    "DialogTitle",
    "Field as FluentField",
    "Input as FluentInput",
    "Select as FluentSelect",
    "Tab",
    "TabList",
  ]) {
    assert.ok(imports.includes(component), `missing Fluent ${component} import`);
  }

  assert.match(workspace, /<Dialog\s+open\s+modalType="modal"/);
  assert.match(workspace, /<DialogSurface\b[^>]*aria-label=\{title\}/);
  assert.match(workspace, /<DialogTitle\s+as="h2">\{title\}<\/DialogTitle>/);
  assert.match(
    workspace,
    /<DialogActions[^>]*>[\s\S]*type="submit"[\s\S]*<\/DialogActions>/,
  );
  assert.match(workspace, /<FluentField\s+label=\{l\}/);
  assert.match(workspace, /<FluentInput\s+name=\{n\}/);
  assert.match(workspace, /<FluentSelect\s+name=\{n\}/);
  assert.match(workspace, /<TabList\b[^>]*aria-label="Client record sections"/);
  assert.match(workspace, /<Tab\s+value="overview"/);
});

test("the client workspace has useful zero-data and filtered-empty states", () => {
  assert.match(workspace, /!state\.clients\.length\s*\?\s*\(/);
  assert.match(
    workspace,
    /aria-labelledby="clients-empty-title"[\s\S]*id="clients-empty-title">Add your first client/,
  );
  assert.match(
    workspace,
    /<Button\s+appearance="primary"\s+onClick=\{create\}>[\s\S]*Add first client/,
  );
  assert.match(workspace, /No clients match this search and status filter/);
  assert.match(
    workspace,
    /setClientQuery\(""\);\s*setClientStatus\("ALL"\);[\s\S]*Clear filters/,
  );
});

test("the client record dialog stays structured, conventional and optional-contact friendly", () => {
  const clientDialog = sourceSection(
    workspace,
    "function ClientRecordDialog(",
    "function GovernancePersonDialog(",
  );

  assert.match(
    workspace,
    /dialog\.kind === "client" \|\| dialog\.kind === "editClient"[\s\S]*<ClientRecordDialog/,
    "client create and edit must use the dedicated dialog rather than the generic record form",
  );
  assert.match(clientDialog, /<Dialog\s+[\s\S]*?modalType="modal"/);
  assert.match(
    clientDialog,
    /<DialogSurface\s+className="client-dialog-surface"\s+aria-label=\{title\}>/,
  );
  assert.match(clientDialog, /<form\s+className="client-dialog-form"\s+onSubmit=\{submit\}>/);
  assert.match(clientDialog, /<DialogBody>/);
  assert.match(clientDialog, /<DialogTitle[\s\S]*?action=\{[\s\S]*?Close \$\{title\}[\s\S]*?<\/DialogTitle>/);
  assert.match(clientDialog, /<DialogContent\s+className="client-dialog-content">/);
  assert.match(clientDialog, /<div\s+className="client-dialog-grid">/);
  assert.match(
    clientDialog,
    /<Select\s+[\s\S]*?className="client-dialog-wide"[\s\S]*?n="legalForm"/,
    "the longer organisation field must retain its full-width layout hook",
  );

  const contactName = fieldMarkup(clientDialog, "contactName");
  assert.match(contactName, /l="Primary contact \(optional\)"/);
  assert.doesNotMatch(contactName, /\brequired\b/);
  const contactEmail = fieldMarkup(clientDialog, "contactEmail");
  assert.match(contactEmail, /l="Contact email \(optional\)"/);
  assert.match(contactEmail, /type="email"/);
  assert.doesNotMatch(contactEmail, /\brequired\b/);

  assert.match(
    clientDialog,
    /<DialogActions>[\s\S]*?<Button\s+appearance="secondary"\s+type="button"\s+onClick=\{close\}>[\s\S]*?Cancel[\s\S]*?<Button\s+appearance="primary"\s+type="submit">[\s\S]*?Create client[\s\S]*?<\/DialogActions>/,
    "Cancel must precede the primary submit action in the dialog footer",
  );
  assert.doesNotMatch(clientDialog, /className="modal-form"/);
});

test("communications creation remains a native submit flow on both sides", () => {
  for (const [surfaceName, surface] of [
    ["practitioner", practitionerMessages],
    ["client", clientMessages],
  ] as const) {
    assert.match(
      surface,
      /<form\b[\s\S]*?onSubmit=\{[\s\S]*?preventDefault\(\)[\s\S]*?createConversation[\s\S]*?<\/form>/,
      `${surfaceName} conversation creation must be owned by a form submit handler`,
    );
    assert.match(
      surface,
      /<(?:Button|button)\s+[^>]*type="submit"[^>]*>/,
      `${surfaceName} send control must explicitly submit the form`,
    );
  }
});

test("communication modals cannot regress to bespoke dialog accessibility", () => {
  for (const [surfaceName, surface] of [
    ["practitioner", practitionerMessages],
    ["client", clientMessages],
  ] as const) {
    const imports = namedImports(surface, "@fluentui/react-components");
    assert.ok(imports.includes("Dialog"), `${surfaceName} surface must import Fluent Dialog`);
    assert.ok(
      imports.includes("DialogSurface"),
      `${surfaceName} surface must import Fluent DialogSurface`,
    );
    assert.match(surface, /<Dialog\s+open\s+modalType="modal"/);
    assert.match(surface, /<DialogSurface\b[^>]*aria-labelledby=/);
    assert.doesNotMatch(
      surface,
      /modal-backdrop|role=["']dialog["']|aria-modal=/,
      `${surfaceName} surface must not reimplement focus trapping and modal semantics`,
    );
  }
});
