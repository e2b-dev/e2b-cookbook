#!/usr/bin/env bash

set -euo pipefail

days=90
metadata=""
apply=false

while (($#)); do
  case "$1" in
    --days) days="${2:?--days requires a value}"; shift 2 ;;
    --metadata) metadata="${2:?--metadata requires key=value pairs}"; shift 2 ;;
    --apply) apply=true; shift ;;
    *) echo "Usage: $0 [--days N] [--metadata key=value] [--apply]" >&2; exit 2 ;;
  esac
done

if ! [[ "$days" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
  echo "--days must be a non-negative number" >&2
  exit 2
fi

candidates="$(mktemp)"
fresh_eligible_ids="$(mktemp)"
trap 'rm -f "$candidates" "$fresh_eligible_ids"' EXIT

jq_filter='
  def epoch:
    sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601;
  .[]
  | select((.startedAt | epoch) < (now - ($days * 86400)))
  | [.sandboxId, .startedAt]
  | @tsv
'

list_args=(sandbox list --state paused --format json)
if [[ -n "$metadata" ]]; then
  list_args+=(--metadata "$metadata")
fi

e2b "${list_args[@]}" | jq --argjson days "$days" -r "$jq_filter" >"$candidates"
cat "$candidates"
count="$(wc -l <"$candidates" | tr -d ' ')"

if [[ "$apply" != true ]]; then
  echo "Dry run: $count sandbox(es) matched. Re-run with --apply to delete."
  exit 0
fi

# Refresh once before deleting so resumed sandboxes are skipped.
e2b "${list_args[@]}" \
  | jq --argjson days "$days" -r "$jq_filter" \
  | cut -f1 \
  | sort -u >"$fresh_eligible_ids"

deleted=0
while IFS=$'\t' read -r sandbox_id started_at; do
  [[ -n "$sandbox_id" ]] || continue
  if ! grep -Fqx "$sandbox_id" "$fresh_eligible_ids"; then
    echo "Skipped $sandbox_id: no longer eligible"
    continue
  fi

  e2b sandbox kill "$sandbox_id"
  echo "Deleted $sandbox_id (last started $started_at)"
  ((deleted += 1))
done <"$candidates"

echo "Deleted $deleted sandbox(es)."
