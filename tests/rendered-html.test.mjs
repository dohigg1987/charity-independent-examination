import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

test("build includes development preview metadata", async () => {
  const serverRoot = new URL("../dist/server/", import.meta.url);
  const entries = await readdir(serverRoot, { recursive: true });
  const javascriptFiles = entries.filter((entry) => entry.endsWith(".js"));
  const output = (
    await Promise.all(
      javascriptFiles.map((entry) => readFile(new URL(entry, serverRoot), "utf8")),
    )
  ).join("\n");

  assert.match(output, /["'`]codex-preview["'`]\s*:\s*["'`]development["'`]/);
});
