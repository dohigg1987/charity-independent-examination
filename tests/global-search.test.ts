import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(
  new URL("../components/operational-workspace.tsx", import.meta.url),
  "utf8",
);

function section(start: string, end: string) {
  const startIndex = workspace.indexOf(start);
  const endIndex = workspace.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);
  return workspace.slice(startIndex, endIndex);
}

test("global search normalises input and indexes clients, engagements and workpapers", () => {
  const search = section(
    "export function workspaceSearchResults(",
    "export function OperationalWorkspace()",
  );
  assert.match(search, /query\.trim\(\)\.toLocaleLowerCase\("en-GB"\)/);
  assert.match(search, /clients:\s*state\.clients/);
  for (const clientField of ["client.name", "client.charityNumber", "client.legalForm", "client.contactName"]) {
    assert.match(search, new RegExp(clientField.replace(".", "\\.")));
  }
  assert.match(search, /engagements:\s*state\.engagements/);
  assert.match(search, /tasks:\s*state\.tasks/);
  assert.match(search, /\.includes\(needle\)/);
});

test("the full workspace renders client results and navigates to their record", () => {
  const operational = section(
    "export function OperationalWorkspace()",
    "function FirstRunWorkspace(",
  );
  assert.match(operational, /const results = workspaceSearchResults\(state, query\)/);
  assert.match(operational, /results\.clients\.map\(\(client\) =>/);
  assert.match(operational, /onClick=\{\(\) => goClient\(client\.id\)\}/);
  assert.match(operational, /ref=\{searchRef\}[\s\S]*onChange=\{\(_, data\) => setQuery\(data\.value\)\}/);
});

test("search remains functional before the first engagement exists", () => {
  const firstRun = section("function FirstRunWorkspace(", "function Portfolio(");
  assert.match(firstRun, /const \[query, setQuery\] = useState\(""\)/);
  assert.match(firstRun, /<SearchBox[\s\S]*placeholder="Search clients"/);
  assert.match(firstRun, /results\.clients\.map\(\(client\) =>/);
  assert.match(firstRun, /onClick=\{\(\) => openClient\(client\.id\)\}/);
  assert.doesNotMatch(firstRun, /<span>Dashboard<\/span>/);
});

test("first-run navigation retains every engagement-independent module", () => {
  const firstRun = section("function FirstRunWorkspace(", "function Portfolio(");
  for (const view of ["clients", "team", "templates", "audit", "admin"]) {
    assert.match(firstRun, new RegExp(`view === "${view}"`));
  }
  for (const label of [
    "Clients",
    "Team",
    "Templates",
    "Audit trail",
    "Administration",
  ]) {
    assert.match(firstRun, new RegExp(`text="${label}"`));
  }
  assert.match(firstRun, /<Team[\s\S]*mutate=\{mutate\}[\s\S]*notify=\{notify\}/);
  assert.match(firstRun, /view === "templates" && <Templates \/>/);
  assert.match(firstRun, /view === "audit" && <Audit state=\{state\} \/>/);
  assert.match(
    firstRun,
    /view === "admin"[\s\S]*<Admin state=\{state\} mutate=\{mutate\} notify=\{notify\}/,
  );
  assert.match(firstRun, /disabled[\s\S]*Annual-file workspace unavailable until an engagement is created/);
});

test("the advertised keyboard shortcut focuses the real search input", () => {
  assert.match(workspace, /const searchRef = useRef<HTMLInputElement>\(null\)/);
  assert.match(workspace, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(workspace, /event\.key\.toLowerCase\(\) === "k"/);
  assert.match(workspace, /searchRef\.current\?\.focus\(\)/);
  assert.match(workspace, /removeEventListener\("keydown", focusSearch\)/);
});
