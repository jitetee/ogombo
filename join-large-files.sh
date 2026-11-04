#!/usr/bin/env bash
# Rebuilds files that push.sh split into .partNN pieces, then checks their md5.
cd "$(dirname "$0")" || exit 1
find . -name '*.part00' -print0 | while IFS= read -r -d '' p; do
  f=${p%.part00}
  cat "$f".part[0-9][0-9] > "$f" && ( cd "$(dirname "$f")" && md5sum -c "$(basename "$f").md5" )
done
