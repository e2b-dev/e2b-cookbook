#!/usr/bin/env bash
# Check out the verl-recipe revision this example was tested with into ./recipe.
# verl imports recipes as the `recipe` package, so the folder name matters.
set -euo pipefail

repo="${RECIPE_REPO:-https://github.com/verl-project/verl-recipe.git}"
commit="${RECIPE_COMMIT:-TBA}"

cd "$(dirname "$0")"
if [ ! -d recipe/.git ]; then
  git clone --quiet "$repo" recipe
fi
git -C recipe fetch --quiet "$repo" "$commit" 2>/dev/null || true
git -C recipe -c advice.detachedHead=false checkout --quiet "$commit"
echo "recipe at $(git -C recipe rev-parse --short HEAD)"
