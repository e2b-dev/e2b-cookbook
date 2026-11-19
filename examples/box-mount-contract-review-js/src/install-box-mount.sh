#!/bin/sh
# Install the Box Mount Linux binary from a raw executable or a .tar.gz/.tgz/.zip archive.
# The binary keeps its shipped name (it may re-execute itself by that name) and gets a
# `box-mount` alias if it has a different one.
set -eu
dist="$1"
cd "$dist"
for archive in *.tar.gz *.tgz; do
  if [ -f "$archive" ]; then tar -xzf "$archive" && rm "$archive"; fi
done
for archive in *.zip; do
  if [ -f "$archive" ]; then python3 -m zipfile -e "$archive" . && rm "$archive"; fi
done

linux_binaries=$(find . -type f | while IFS= read -r candidate; do
  if [ "$(head -c 4 "$candidate" | od -An -c | tr -d ' ')" = "177ELF" ]; then echo "$candidate"; fi
done)
count=$(printf '%s' "$linux_binaries" | grep -c . || true)
if [ "$count" -ne 1 ]; then
  echo "Expected exactly one Linux Box Mount binary in private/, found $count." >&2
  exit 1
fi

name=$(basename "$linux_binaries")
install -m 0755 "$linux_binaries" "/usr/local/bin/$name"
if [ "$name" != "box-mount" ]; then ln -sf "/usr/local/bin/$name" /usr/local/bin/box-mount; fi
rm -rf "$dist"
box-mount --version
