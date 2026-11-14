#!/usr/bin/env bash
# Runs the formatter's regression cases.
#
#   tests/run.sh [fastfmt-binary]
#
# Each tests/cases/<name>.cpp with a <name>.expected (clang-format 18, LLVM
# style, ColumnLimit 120) must format to it, and formatting the expected file
# must leave it unchanged. unbalanced.cpp must be skipped and left untouched.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
bin=${1:-$here/../build/fastfmt}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
fail=0 pass=0

for src in "$here"/cases/*.cpp; do
  name=$(basename "$src" .cpp)
  expected="$here/cases/$name.expected"
  [ -f "$expected" ] || continue
  if "$bin" "$src" > "$work/out" && cmp -s "$work/out" "$expected"; then
    pass=$((pass + 1))
  else
    echo "FAIL $name: output differs from $name.expected"
    diff "$work/out" "$expected" | head -20
    fail=$((fail + 1))
  fi
  # Idempotence: the expected output is already formatted.
  cp "$expected" "$work/idem.cpp"
  if ! "$bin" --check -q "$work/idem.cpp" > /dev/null; then
    echo "FAIL $name: formatting $name.expected changes it"
    fail=$((fail + 1))
  fi
done

# Unbalanced input is skipped, not mangled.
cp "$here/cases/unbalanced.cpp" "$work/unbalanced.cpp"
"$bin" -i -q "$work/unbalanced.cpp" > /dev/null 2>&1
if cmp -s "$work/unbalanced.cpp" "$here/cases/unbalanced.cpp"; then
  pass=$((pass + 1))
else
  echo "FAIL unbalanced: an unbalanced file was rewritten"
  fail=$((fail + 1))
fi

# `// fastfmt off` keeps a region verbatim (clang-format has no such pragma).
printf 'int   a=1;\n// fastfmt off\nint   b =  2 ;\n// fastfmt on\nint   c=3;\n' > "$work/off.cpp"
printf 'int a = 1;\n// fastfmt off\nint   b =  2 ;\n// fastfmt on\nint c = 3;\n' > "$work/off.expected"
if "$bin" "$work/off.cpp" | cmp -s - "$work/off.expected"; then
  pass=$((pass + 1))
else
  echo "FAIL fastfmt-off: region not kept verbatim"
  "$bin" "$work/off.cpp" | diff - "$work/off.expected"
  fail=$((fail + 1))
fi

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
