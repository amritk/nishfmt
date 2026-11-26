#!/usr/bin/env bash
# Runs the check a C++ project's CI runs on nishfmt's output: clang-format
# once on each file cmp.sh formatted ($WORK/cpp/out), failing a file it would
# change, as `clang-format --dry-run --Werror` does.
#
#   verify.sh
#
# Run it after `cmp.sh <nishfmt> cpp`. It prints how many of the files
# nishfmt formatted fail the check, and how many it skipped (left as in raw/,
# where the check fails on the unformatted source); fails.txt and
# skipped-unformatted.txt in $WORK/cpp list them. Needs clang-format 23.1.5.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
CORPUS=${CORPUS:-$here/../work/corpus} WORK=${WORK:-$here/../work/out}
CORPUS=$(cd "$CORPUS" && pwd) && WORK=$(cd "$WORK" && pwd) || exit 2
d=$CORPUS/cpp w=$WORK/cpp
[ -d "$w/out" ] || { echo "verify.sh: no $w/out; run cmp.sh first" >&2; exit 2; }
export RAW=$d/raw
(cd "$w/out" && find . -type f -print0 | grep -zvxF -f "$d/failed.txt" | xargs -0 -P"$(nproc)" -I{} sh -c '
  if clang-format --style="{BasedOnStyle: LLVM, ColumnLimit: 120}" "$1" | cmp -s - "$1"; then exit 0; fi
  if cmp -s "$1" "$RAW/$1"; then echo "S $1"; else echo "F $1"; fi' _ {}) > "$w/verify.txt"
sed -n 's/^F //p' "$w/verify.txt" | sort > "$w/fails.txt"
sed -n 's/^S //p' "$w/verify.txt" | sort > "$w/skipped-unformatted.txt"
rm -f "$w/verify.txt"
total=$(( $(find "$w/out" -type f | wc -l) - $(wc -l < "$d/failed.txt") ))
echo "cpp: $(wc -l < "$w/fails.txt") of $total files fail a clang-format check after nishfmt formats them;" \
  "$(wc -l < "$w/skipped-unformatted.txt") more are files it skipped, left unformatted"
