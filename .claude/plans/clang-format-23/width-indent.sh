#!/usr/bin/env bash
# The --width/--indent check for the clang-format 23.1.5 upgrade: formats
# leveldb, googletest and abseil-cpp from the C++ corpus with
# `nishfmt --width 100 --indent 4` and with clang-format 23.1.5 at
# {BasedOnStyle: LLVM, ColumnLimit: 100, IndentWidth: 4}, and fails if more
# than 4 files differ (the clang-format 18.1.3 baseline on 2026-11-18).
#
#   bash width-indent.sh   (from the repo root, after the plan's Corpus setup)
set -uo pipefail
CF=${CF:-$TMPDIR/cf23/bin/clang-format}
raw=bench/work/corpus/cpp/raw
w=$(mktemp -d)
trap 'rm -rf "$w"' EXIT
mkdir -p "$w/ref" "$w/nish"
for r in google_leveldb google_googletest abseil_abseil-cpp; do
  cp -r "$raw/$r" "$w/ref/" && cp -r "$raw/$r" "$w/nish/" || exit 2
done
(cd "$w/ref" && find . -type f -print0 | xargs -0 -P"$(nproc)" -n 50 "$CF" -i \
  --style="{BasedOnStyle: LLVM, ColumnLimit: 100, IndentWidth: 4}") || exit 2
dist/nishfmt -i -q --width 100 --indent 4 "$w/nish"
n=$(find "$w/ref" -type f | wc -l)
d=$(diff -rq "$w/nish" "$w/ref" | sed -e 's|^Files '"$w"'/nish/||' -e 's| and .*||')
nd=$(printf '%s' "$d" | grep -c . || true)
printf '%s\n' "$d"
echo "width-indent: $((n - nd)) / $n identical ($nd differ, at most 4 allowed)"
[ "$nd" -le 4 ]
