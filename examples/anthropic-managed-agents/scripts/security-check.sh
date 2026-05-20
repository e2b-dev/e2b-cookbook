#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
failed=0

check_absent() {
  local pattern="$1"
  local message="$2"
  shift 2

  if rg --line-number --fixed-strings "$pattern" "$@"; then
    printf '\nsecurity-check failed: %s\n' "$message" >&2
    failed=1
  fi
}

check_absent \
  "unrestrictedPaths: true" \
  "Managed Agents workers must keep tool execution constrained to workdir" \
  "$ROOT_DIR/javascript/src" "$ROOT_DIR/javascript"/*.md "$ROOT_DIR/javascript"/*/*.md

check_absent \
  "unrestricted_paths=True" \
  "Managed Agents workers must keep tool execution constrained to workdir" \
  "$ROOT_DIR/python/anthropic_managed_agents_e2b" "$ROOT_DIR/python"/*.md "$ROOT_DIR/python"/*/*.md

check_absent \
  "void handleWebhook(request, response);" \
  "webhook handlers must attach .catch() so unexpected read/verify errors return a response" \
  "$ROOT_DIR/javascript/src" "$ROOT_DIR/javascript"/*/*.md

exit "$failed"
