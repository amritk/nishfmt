#!/usr/bin/env bash
# Runs the formatter's regression cases.
#
#   tests/run.sh [nishfmt-binary]
#
# Each tests/cases/<name>.cpp with a <name>.expected (clang-format 23.1.5, LLVM
# style, ColumnLimit 120) must format to it, and formatting the expected file
# must leave it unchanged. unbalanced.cpp and each tests/cases/<lang>/skip_*
# (a file the reference tool rejects) must be skipped and left untouched.
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

# Files the reference tool rejects are skipped, not formatted: each
# tests/cases/<lang>/skip_<name>.<ext>, which has no .expected, must be
# reported skipped by -i and left byte for byte as it is, and --check must find
# nothing to change.
for src in "$here"/cases/*/skip_*; do
  [ -f "$src" ] || continue
  file=${src##*/}
  label=${src#"$here"/cases/}
  label=${label%.*}
  cp "$src" "$work/$file"
  msg=$("$bin" -i "$work/$file" 2>&1)
  case $msg in
    *"nishfmt: skipped $work/$file "*) skipped=1 ;;
    *) skipped=0 ;;
  esac
  if [ "$skipped" -eq 1 ] && cmp -s "$work/$file" "$src" && "$bin" --check -q "$work/$file" > /dev/null 2>&1; then
    pass=$((pass + 1))
  else
    echo "FAIL $label: not skipped and left untouched"
    fail=$((fail + 1))
  fi
done

# A directory is walked whatever its name: a Kotlin case under a package
# directory named like a JSON file (kotest's `io.kotest.assertions.json`),
# formatted by -i on the tree above it, must become its .expected.
mkdir -p "$work/walk/io.example.json"
cp "$here/cases/kotlin/type_two_modifier_lists.kt" "$work/walk/io.example.json/T.kt"
"$bin" -i -q "$work/walk" > /dev/null 2>&1
if cmp -s "$work/walk/io.example.json/T.kt" "$here/cases/kotlin/type_two_modifier_lists.expected"; then
  pass=$((pass + 1))
else
  echo "FAIL walk-dotted-dir: a file under io.example.json/ was not formatted"
  fail=$((fail + 1))
fi

# The walk follows no symbolic link: a link to an ancestor (a cycle) and a
# link to a file in the tree are left out, so each file is listed once, while
# a directory named like a source is still walked.
mkdir -p "$work/links/a" "$work/links/Dir.kt"
cp "$here/cases/kotlin/type_two_modifier_lists.kt" "$work/links/a/T.kt"
cp "$here/cases/kotlin/type_two_modifier_lists.kt" "$work/links/Dir.kt/U.kt"
ln -s .. "$work/links/a/up"
ln -s a/T.kt "$work/links/link.kt"
listed=$("$bin" --check "$work/links" 2> /dev/null | sort)
want=$(printf '%s\n' "$work/links/Dir.kt/U.kt" "$work/links/a/T.kt")
if [ "$listed" = "$want" ]; then
  pass=$((pass + 1))
else
  echo "FAIL walk-symlinks: --check listed $(printf '%s\n' "$listed" | wc -l) paths, not the 2 real files"
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

# A file a formatter panics on takes down only the worker formatting it: the
# rest of its chunk is still formatted, the file is left untouched and counted
# as skipped (and crashed), and the run prints its summary with the exit
# status it would have had. The trigger is a Rust input the Rust formatter
# panics on (an index out of range); rustfmt rejects it. If it stops
# panicking, these fail with "no crash": use another input that panics.
crash_src='fn f<T: Clone,, U:, V>() {}\n'
good_src='fn  main( ) { let x=1; }\n'
good_out='fn main() {\n    let x = 1;\n}\n'
printf "$good_out" > "$work/good.expected"
# crash_tree <dir> <good files>: a.rs and g05z.rs panic, g01.rs ... format.
crash_tree() {
  rm -rf "$1" && mkdir -p "$1"
  printf "$crash_src" > "$1/a.rs"
  printf "$crash_src" > "$1/g05z.rs"
  for i in $(seq -w 1 "$2"); do printf "$good_src" > "$1/g$i.rs"; done
}
# crash_check <label> <dir> <good files> <stderr> <exit> <want exit> <want summary>
crash_check() {
  local ok=1 f
  case $4 in *"nishfmt: skipped $2/a.rs (formatter crashed)"*) ;; *) ok=0; echo "FAIL $1: no crash reported for a.rs" ;; esac
  case $4 in *"nishfmt: skipped $2/g05z.rs (formatter crashed)"*) ;; *) ok=0; echo "FAIL $1: no crash reported for g05z.rs" ;; esac
  case $4 in *"$7"*) ;; *) ok=0; echo "FAIL $1: no summary \"$7\"" ;; esac
  [ "$5" -eq "$6" ] || { ok=0; echo "FAIL $1: exit $5, want $6"; }
  for f in a g05z; do
    printf "$crash_src" | cmp -s - "$2/$f.rs" || { ok=0; echo "FAIL $1: $f.rs was rewritten"; }
  done
  local bad=0 want=$work/good.expected
  [ "$6" -eq 1 ] && { want=$work/good.src; printf "$good_src" > "$want"; }
  for i in $(seq -w 1 "$3"); do
    cmp -s "$2/g$i.rs" "$want" || bad=$((bad + 1))
  done
  [ "$bad" -eq 0 ] || { ok=0; echo "FAIL $1: $bad of the $3 other files not as expected"; }
  if [ "$ok" -eq 1 ]; then
    pass=$((pass + 1))
  else
    echo "$4" | head -20
    fail=$((fail + 1))
  fi
}
# Few files (one worker, one chunk) and many (chunks, several workers).
for run in "8 -i" "70 -i -j 1" "70 -i -j 3" "8 --check" "70 --check -j 2"; do
  set -- $run
  n=$1
  shift
  d=$work/crash
  crash_tree "$d" "$n"
  msg=$("$bin" "$@" "$d" 2>&1)
  st=$?
  want=0 verb=reformatted
  [ "$1" = --check ] && want=1 verb="would reformat"
  crash_check "crash ($run)" "$d" "$n" "$msg" "$st" "$want" \
    "nishfmt: $((n + 2)) files, $verb $n, skipped 2 (2 crashed);"
done
# One file to stdout: printed as it is.
printf "$crash_src" > "$work/crash1.rs"
out=$("$bin" "$work/crash1.rs" 2> "$work/err")
st=$?
if [ "$st" -eq 0 ] && [ "$out" = "$(printf "$crash_src")" ] && grep -qF "skipped $work/crash1.rs (formatter crashed)" "$work/err"; then
  pass=$((pass + 1))
else
  echo "FAIL crash (stdout): exit $st, $(cat "$work/err" | head -5)"
  fail=$((fail + 1))
fi

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
