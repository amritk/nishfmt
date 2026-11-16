#!/usr/bin/env bash
# Runs the CSharp dev driver over CSharpier's own formatting tests
# (Src/CSharpier.Tests/FormattingTests/TestFiles/cs): X.test must format to
# X.expected.test when that exists, else to itself.
#   testfiles.sh <driver> [csharpier-checkout]
set -uo pipefail
drv=$1
repo=${2:-/work/repos/belav_csharpier}
dir=$repo/Src/CSharpier.Tests/FormattingTests/TestFiles/cs
OUT=${OUT:-/tmp/claude-0/testfiles}
rm -rf "$OUT" && mkdir -p "$OUT"
pass=0 fail=0
for t in "$dir"/*.test; do
  case "$t" in *.expected.test) continue ;; esac
  name=$(basename "$t" .test)
  exp="$dir/$name.expected.test"
  [ -f "$exp" ] || exp=$t
  cp "$t" "$OUT/$name.cs"
  if "$drv" "$OUT/$name.cs" > "$OUT/$name.out" 2> "$OUT/$name.err"; then
    if cmp -s "$OUT/$name.out" "$exp"; then
      pass=$((pass + 1))
      continue
    fi
    diff "$OUT/$name.out" "$exp" > "$OUT/$name.diff"
  else
    echo "skipped: $(head -c 200 "$OUT/$name.err")" > "$OUT/$name.diff"
  fi
  fail=$((fail + 1))
  echo "$name"
done
echo "pass $pass fail $fail"
