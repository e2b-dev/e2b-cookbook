#!/usr/bin/env bash
# Launch the OpenCode TUI with the E2B workspace plugin enabled.
#
# The generated opencode.json is written to a temp directory on purpose: a config
# inside this project would be uploaded into the sandbox with the rest of the
# project, and the sandbox's own OpenCode would then try to load the plugin too.
set -euo pipefail

cd "$(dirname "$0")/.."
if [ -f .env ]; then set -a; . ./.env; set +a; fi
: "${E2B_API_KEY:?Set E2B_API_KEY (see .env.example)}"
# The workspace API exists only in OpenCode 1. The installer on opencode.ai installs OpenCode 2.
if ! command -v opencode >/dev/null; then
  echo '`opencode` was not found on PATH. Install OpenCode 1 (1.16.0 or newer) first: npm i -g opencode-ai' >&2
  exit 1
fi
installed="$(opencode --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n 1 || true)"
case "$installed" in
  "" | 1.1[6-9].* | 1.[2-9][0-9].* | 1.[1-9][0-9][0-9]*.*) ;; # a build that prints no version is let through, as in src/index.ts
  *) echo "This example needs OpenCode 1, version 1.16.0 or newer (found $installed). Install it with: npm i -g opencode-ai" >&2; exit 1 ;;
esac
# The project OpenCode opens. By default: a fresh, standalone copy of the bundled WIP
# project, initialised as its own git repository — like a real project you would warp.
# (Warp moves changes between the sandbox and your repo by applying a git patch, so the
# project must be a repository root on both sides.) Pass a directory to use your own.
if [ -n "${1:-}" ]; then
  project="$1"
else
  # A stable path on purpose: the plugin keys the sandbox template on the project path,
  # so reusing it means later runs skip the template build.
  project="${XDG_CACHE_HOME:-$HOME/.cache}/opencode-e2b-demo/invoicer"
  rm -rf "$project" && mkdir -p "$project"
  cp -R demo-project/. "$project"
  git -C "$project" init -q -b main
  git -C "$project" add -A
  git -C "$project" -c user.name=demo -c user.email=demo@example.com commit -q -m "WIP: invoicing library"
  echo "Opening a fresh copy of demo-project at $project" >&2
fi

plugin="${OPENCODE_E2B_PLUGIN:-@e2b/opencode}"
config_dir="$(mktemp -d)"
{
  echo '{'
  echo '  "$schema": "https://opencode.ai/config.json",'
  [ -n "${OPENCODE_MODEL:-}" ] && echo "  \"model\": \"$OPENCODE_MODEL\","
  echo "  \"plugin\": [[\"$plugin\", { \"sandboxTimeoutMs\": 3600000 }]]"
  echo '}'
} > "$config_dir/opencode.json"

export OPENCODE_CONFIG="$config_dir/opencode.json"
export OPENCODE_EXPERIMENTAL_WORKSPACES=true
cd "$project"
exec opencode
