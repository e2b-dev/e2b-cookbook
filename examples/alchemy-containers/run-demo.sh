#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
docker build -t e2b-cf-proxy:nat proxy
cd app
bun install --frozen-lockfile
exec bash run-local.sh
