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
