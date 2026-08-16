#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

export WRANGLER_LOG_PATH="${WRANGLER_LOG_PATH:-.wrangler/wrangler.log}"

./node_modules/.bin/wrangler d1 migrations apply DB \
  --local \
  --config wrangler.preview.jsonc \
  --persist-to .wrangler/state

exec ./node_modules/.bin/vite "$@"
