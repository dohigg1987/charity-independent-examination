#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${SITES_ENV_READY:-}" != "1" ]]; then
  exec "${script_dir}/sites-env.sh" -- "$0" "$@"
fi

worker="${SITES_PROJECT_ROOT}/dist/server/index.js"
hosting="${SITES_PROJECT_ROOT}/dist/.openai/hosting.json"

[[ -f "${worker}" ]] || {
  echo "Missing Sites Worker entry: dist/server/index.js" >&2
  exit 66
}
[[ -f "${hosting}" ]] || {
  echo "Missing packaged Sites manifest: dist/.openai/hosting.json" >&2
  exit 66
}

node --input-type=module - "${worker}" "${hosting}" <<'NODE'
import { readFile } from "node:fs/promises";

const [workerPath, hostingPath] = process.argv.slice(2);
JSON.parse(await readFile(hostingPath, "utf8"));
const workerSource = await readFile(workerPath, "utf8");
const hasDefaultExport = /export\s+default\b/.test(workerSource) || /export\s*\{[\s\S]*?\bas\s+default\b[\s\S]*?\}/.test(workerSource);
const hasFetchHandler = /\bfetch\s*\(/.test(workerSource) || /\bfetch\s*:/.test(workerSource);
if (!hasDefaultExport || !hasFetchHandler) {
  throw new Error("dist/server/index.js must contain an ESM default export and fetch handler");
}
NODE

echo "Validated Sites artifact: ESM Worker default.fetch and hosting manifest are present."
