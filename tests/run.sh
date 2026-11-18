#!/usr/bin/env bash
# Runs the formatter's regression cases.
#
#   tests/run.sh [nishfmt-binary]
#
# Each tests/cases/<name>.cpp with a <name>.expected (clang-format 18, LLVM
# style, ColumnLimit 120) must format to it, and formatting the expected file
# must leave it unchanged. unbalanced.cpp must be skipped and left untouched.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
bin=${1:-$here/../dist/nishfmt}
bin=$(cd "$(dirname "$bin")" && pwd)/$(basename "$bin")
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

# Other languages: each tests/cases/<lang>/<name>.<ext> with a <name>.expected
# must format to it, and formatting the expected file must leave it unchanged.
for src in "$here"/cases/*/*; do
  [ -f "$src" ] || continue
  file=$(basename "$src")
  case "$file" in *.expected) continue ;; esac
  dir=$(dirname "$src")
  name=${file%.*}
  ext=${file##*.}
  expected="$dir/$name.expected"
  [ -f "$expected" ] || continue
  label="$(basename "$dir")/$name"
  if "$bin" "$src" > "$work/out" && cmp -s "$work/out" "$expected"; then
    pass=$((pass + 1))
  else
    echo "FAIL $label: output differs from $name.expected"
    diff "$work/out" "$expected" | head -20
    fail=$((fail + 1))
  fi
  cp "$expected" "$work/idem.$ext"
  if ! "$bin" --check -q "$work/idem.$ext" > /dev/null; then
    echo "FAIL $label: formatting $name.expected changes it"
    fail=$((fail + 1))
  fi
done

# Dart projects: each tests/cases/dart/pkg-<name>/ is copied to a scratch
# directory, where nishfmt formats each <f>.dart inside it by a relative path,
# so that it reads the copy's package config and analysis_options.yaml. A
# <f>.expected beside it (dart format 3.14.1's output in the copy) must match,
# and formatting it must change nothing; a <f>.untouched beside it means the
# file must be skipped and left as it is.
for pkg in "$here"/cases/dart/pkg-*/; do
  [ -d "$pkg" ] || continue
  pname=$(basename "$pkg")
  rm -rf "$work/pkg" && cp -r "$pkg" "$work/pkg"
  while IFS= read -r rel; do
    rel=${rel#./}
    base=${rel%.dart}
    label="dart/$pname/$rel"
    if [ -f "$work/pkg/$base.untouched" ]; then
      cp "$work/pkg/$rel" "$work/orig"
      msg=$(cd "$work/pkg" && "$bin" -i "$rel" 2>&1)
      skipped=0
      case $msg in *"nishfmt: skipped $rel "*) skipped=1 ;; esac
      if [ "$skipped" -eq 1 ] && cmp -s "$work/pkg/$rel" "$work/orig"; then
        pass=$((pass + 1))
      else
        echo "FAIL $label: not left untouched"
        fail=$((fail + 1))
      fi
      continue
    fi
    [ -f "$work/pkg/$base.expected" ] || continue
    if (cd "$work/pkg" && "$bin" "$rel") > "$work/out" && cmp -s "$work/out" "$work/pkg/$base.expected"; then
      pass=$((pass + 1))
    else
      echo "FAIL $label: output differs from $base.expected"
      diff "$work/out" "$work/pkg/$base.expected" | head -20
      fail=$((fail + 1))
    fi
    # Idempotence, in the same directory and so the same project.
    cp "$work/pkg/$base.expected" "$work/pkg/$base.idem.dart"
    if ! (cd "$work/pkg" && "$bin" --check -q "$base.idem.dart" > /dev/null); then
      echo "FAIL $label: formatting $base.expected changes it"
      fail=$((fail + 1))
    fi
    rm -f "$work/pkg/$base.idem.dart"
  done < <(cd "$work/pkg" && find . -name '*.dart' -type f | sort)
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

# `// nishfmt off` keeps a region verbatim (clang-format has no such pragma).
printf 'int   a=1;\n// nishfmt off\nint   b =  2 ;\n// nishfmt on\nint   c=3;\n' > "$work/off.cpp"
printf 'int a = 1;\n// nishfmt off\nint   b =  2 ;\n// nishfmt on\nint c = 3;\n' > "$work/off.expected"
if "$bin" "$work/off.cpp" | cmp -s - "$work/off.expected"; then
  pass=$((pass + 1))
else
  echo "FAIL nishfmt-off: region not kept verbatim"
  "$bin" "$work/off.cpp" | diff - "$work/off.expected"
  fail=$((fail + 1))
fi

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
