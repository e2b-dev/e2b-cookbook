#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# These are deliberately invalid cloud credentials. The local providers require
# auth-shaped configuration even in dev; no real account/token is used here.
# Never change this command to deploy with these local-only fixtures.
export CLOUDFLARE_ACCOUNT_ID=00000000000000000000000000000000
export CLOUDFLARE_API_TOKEN=local-only-not-a-cloudflare-token
export CONTAINER_EGRESS_INTERCEPTOR_IMAGE=e2b-cf-proxy:nat
export CI=true
exec bun alchemy dev --no-input --stage e2b-probe
