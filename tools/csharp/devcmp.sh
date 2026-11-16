#!/usr/bin/env bash
# Runs the CSharp dev driver over corpus files and compares with the reference:
#   devcmp.sh <driver> <corpus-dir> [max-files] [skip]
# prints the identical count; the differing files go to $OUT/differ.txt,
# the skipped (refused) ones to $OUT/skipped.txt.
set -uo pipefail
drv=$1 dir=$2 max=${3:-1000000} skip=${4:-0}
OUT=${OUT:-/tmp/claude-0/devcmp}
mkdir -p "$OUT"
: > "$OUT/differ.txt"
: > "$OUT/skipped.txt"
same=0 diff=0 skipped=0
cd "$dir/raw" || exit 2
while read -r f; do
  if grep -qxF "$f" "$dir/failed.txt"; then continue; fi
  if "$drv" "$f" > "$OUT/cur.out" 2> "$OUT/cur.err"; then
    if cmp -s "$OUT/cur.out" "$dir/ref/$f"; then
      same=$((same + 1))
    else
      diff=$((diff + 1))
      echo "$f" >> "$OUT/differ.txt"
    fi
  else
    if cmp -s "$f" "$dir/ref/$f"; then
      same=$((same + 1))
    else
      skipped=$((skipped + 1))
      echo "$f $(head -c 200 "$OUT/cur.err")" >> "$OUT/skipped.txt"
    fi
  fi
done < <(find . -name '*.cs' | sort | tail -n +$((skip + 1)) | head -n "$max")
echo "same $same differ $diff skipped $skipped"
